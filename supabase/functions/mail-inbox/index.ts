// Mail page: read the company Zoho Mail mailbox from inside RR Central.
//
//   POST { action: "status" }                                  -> { connected, address }
//   POST { action: "folders" }                                 -> { folders }
//   POST { action: "list", folderId, start?, limit?, unread? }  -> { messages }
//   POST { action: "search", q, start?, limit? }               -> { messages }
//   POST { action: "message", folderId, messageId }            -> { message }
//
// Read only: nothing is sent, moved, deleted or marked as read here.
// The Zoho keys (Client Secret, Refresh Token in app_settings, admin only by
// RLS) are read here with the service role, and the Zoho access token stays
// inside this function. The browser only ever gets mail content.
// Who: admin, manager and sales (rr_is_staff), the same people who see clients.
// Deploy: Actions > Deploy Edge Functions > mail-inbox (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import {
  clampLimit,
  clampStart,
  cleanSearch,
  isZohoId,
  normalizeFolders,
  normalizeMessage,
  plain,
  stripActiveContent,
} from "./mailbox.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  return raw ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : DEFAULT_ORIGINS
}

function corsHeadersFor(req: Request): Record<string, string> {
  const allowed = allowedOrigins()
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const ZOHO_HOST_RE = /^(accounts|mail)\.zoho\.(com|eu|in|com\.au|jp|com\.cn|sa|ca)$/i

function zohoOrigin(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== "https:" || !ZOHO_HOST_RE.test(url.hostname)) throw new Error(`Zoho host not allowed: ${url.hostname}`)
  return url.origin
}

class MailError extends Error {
  constructor(public status: number, message: string, public setup = false) {
    super(message)
  }
}

type Zoho = { mail: string; accountId: string; address: string; token: string }

// Kept in this instance's memory only, never sent to the browser.
let cached: { key: string; token: string; expiresAt: number; accountId: string; address: string } | null = null

async function loadSettings(sb: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await sb
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "zohoClientId",
      "zohoClientSecret",
      "zohoRefreshToken",
      "zohoAccountsDomain",
      "zohoMailDomain",
      "zohoMailAccountId",
      "zohoMailEnabled",
    ])
  if (error) throw new Error("Could not read the Zoho settings")
  const s: Record<string, string> = {}
  for (const row of (data || []) as { key: string; value: string }[]) s[row.key] = String(row.value ?? "").trim()
  return s
}

function isConnected(s: Record<string, string>): boolean {
  return Boolean(s.zohoClientId && s.zohoClientSecret && s.zohoRefreshToken && (s.zohoMailEnabled || "no").toLowerCase() === "yes")
}

async function zoho(sb: SupabaseClient): Promise<Zoho> {
  const s = await loadSettings(sb)
  if (!isConnected(s)) {
    throw new MailError(409, "Zoho Mail is not connected. An admin turns it on in Settings, Zoho (Mail: yes).", true)
  }
  const accounts = zohoOrigin(s.zohoAccountsDomain || "https://accounts.zoho.com")
  const mail = s.zohoMailDomain ? zohoOrigin(s.zohoMailDomain) : accounts.replace("accounts.", "mail.")
  const key = `${s.zohoClientId}|${s.zohoRefreshToken.slice(-8)}|${mail}|${s.zohoMailAccountId || ""}`
  if (cached && cached.key === key && cached.expiresAt > Date.now() + 60_000) {
    return { mail, accountId: cached.accountId, address: cached.address, token: cached.token }
  }

  const tokenRes = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: s.zohoClientId,
      client_secret: s.zohoClientSecret,
      refresh_token: s.zohoRefreshToken,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!tok.access_token) {
    throw new MailError(502, `Zoho sign in failed${tok.error ? ` (${tok.error})` : ""}. An admin may need to reconnect Zoho in Settings.`, true)
  }

  const accRes = await fetch(`${mail}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` },
    signal: AbortSignal.timeout(20_000),
  })
  const accBody = (await accRes.json().catch(() => ({}))) as {
    data?: { accountId?: string | number; primaryEmailAddress?: string; mailboxAddress?: string }[]
    status?: { description?: string }
  }
  if (!accRes.ok) throw new MailError(502, accBody.status?.description || `Zoho Mail answered ${accRes.status}`)
  const list = accBody.data || []
  const account = s.zohoMailAccountId ? list.find((a) => String(a.accountId) === s.zohoMailAccountId) : list[0]
  if (!account?.accountId) throw new MailError(502, "No Zoho Mail account found for this connection")

  cached = {
    key,
    token: tok.access_token,
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    accountId: String(account.accountId),
    address: String(account.primaryEmailAddress || account.mailboxAddress || ""),
  }
  return { mail, accountId: cached.accountId, address: cached.address, token: cached.token }
}

async function zohoGet(z: Zoho, path: string, params?: Record<string, string>): Promise<unknown> {
  const qs = params ? `?${new URLSearchParams(params)}` : ""
  const res = await fetch(`${z.mail}/api/accounts/${encodeURIComponent(z.accountId)}${path}${qs}`, {
    headers: { Authorization: `Zoho-oauthtoken ${z.token}` },
    signal: AbortSignal.timeout(25_000),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; status?: { description?: string } }
  if (res.status === 401) {
    cached = null
    throw new MailError(502, "Zoho refused the mail key. An admin may need to reconnect Zoho with the Mail read scopes.", true)
  }
  if (!res.ok) throw new MailError(502, body.status?.description || `Zoho Mail answered ${res.status}`)
  return body.data
}

const rows = (data: unknown) => (Array.isArray(data) ? (data as Record<string, unknown>[]) : [])

Deno.serve(withErrorLog("mail-inbox", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const origin = req.headers.get("Origin")
  if (origin && !allowedOrigins().includes(origin)) return json({ error: "Origin not allowed" }, 403)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Verify JWT is off for this function, so check the signed in user here, before anything else.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  // Admin, manager and sales only: staff (assigned accounts) and viewers do not read company mail.
  const { data: isStaff } = await userDb.rpc("rr_is_staff")
  if (isStaff !== true) return json({ error: "Your role cannot open the company mailbox" }, 403)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || "status")

  try {
    if (action === "status") {
      const s = await loadSettings(sb)
      if (!isConnected(s)) return json({ connected: false, address: "" })
      const z = await zoho(sb)
      return json({ connected: true, address: z.address })
    }

    if (action === "folders") {
      const z = await zoho(sb)
      return json({ folders: normalizeFolders(rows(await zohoGet(z, "/folders"))) })
    }

    if (action === "list") {
      if (!isZohoId(body.folderId)) return json({ error: "Pick a folder" }, 400)
      const z = await zoho(sb)
      const data = await zohoGet(z, "/messages/view", {
        folderId: body.folderId,
        start: String(clampStart(body.start)),
        limit: String(clampLimit(body.limit)),
        status: body.unread === true ? "unread" : "all",
        includeto: "true",
        sortBy: "date",
        sortorder: "false",
      })
      return json({ messages: rows(data).map(normalizeMessage).filter(Boolean) })
    }

    if (action === "search") {
      const q = cleanSearch(body.q)
      if (q.length < 2) return json({ error: "Type at least 2 characters to search" }, 400)
      const z = await zoho(sb)
      const data = await zohoGet(z, "/messages/search", {
        searchKey: `entire:${q}`,
        start: String(clampStart(body.start)),
        limit: String(clampLimit(body.limit)),
        includeto: "true",
      })
      return json({ messages: rows(data).map(normalizeMessage).filter(Boolean) })
    }

    if (action === "message") {
      if (!isZohoId(body.folderId) || !isZohoId(body.messageId)) return json({ error: "Pick an email" }, 400)
      const z = await zoho(sb)
      const base = `/folders/${body.folderId}/messages/${body.messageId}`
      const [details, content] = await Promise.all([zohoGet(z, `${base}/details`), zohoGet(z, `${base}/content`)])
      const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>
      const head = normalizeMessage({ ...d, messageId: body.messageId, folderId: body.folderId })
      const html = String(((content && typeof content === "object" ? content : {}) as { content?: unknown }).content || "")
      return json({
        message: {
          ...head,
          ccAddress: plain(d.ccAddress, 1000),
          html: stripActiveContent(html),
        },
      })
    }

    return json({ error: "Unknown action" }, 400)
  } catch (e) {
    if (e instanceof MailError) return json({ error: e.message, setup: e.setup || undefined }, e.status)
    console.error("mail-inbox failed", e instanceof Error ? e.message : e)
    return json({ error: "Zoho Mail could not be reached. Please try again." }, 502)
  }
}))
