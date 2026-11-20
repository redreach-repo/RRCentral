// Mail page: each person reads their OWN Zoho mailbox inside RR Central.
// Nobody, not even an admin, can open another person's mailbox through here.
//
//   POST { action: "status" }                                  -> { ready, connected, address }
//   POST { action: "connect", return_to }                      -> { url }   (Zoho consent page)
//   GET  ?code=…&state=…&accounts-server=…                     Zoho's answer (signed state)
//   POST { action: "disconnect" }                              -> { ok }
//   POST { action: "folders" }                                 -> { folders }
//   POST { action: "list", folderId, start?, limit?, unread? }  -> { messages }
//   POST { action: "search", q, start?, limit? }               -> { messages }
//   POST { action: "message", folderId, messageId }            -> { message }
//
// Read only: nothing is sent, moved, deleted or marked as read here.
// Each person's Zoho refresh token is stored encrypted in mail_accounts
// (service role only, no policies) and the access token never leaves this
// function. The browser only ever gets mail content.
// Who: admin, manager and sales (rr_is_staff). The Zoho mailbox must be the
// person's own: one of its addresses must be their RR Central login.
//
// Secrets: ZOHO_MAIL_CLIENT_ID, ZOHO_MAIL_CLIENT_SECRET (a Zoho "Server-based
// Application" whose redirect URI is this function's URL), MAIL_TOKEN_KEY
// (32+ random characters, encrypts the stored tokens), optional
// ZOHO_ACCOUNTS_DOMAIN (default https://accounts.zoho.com).
// Deploy: Actions > Deploy Edge Functions > mail-inbox (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { readState, signState } from "../_shared/googleDrive.ts"
import {
  clampLimit,
  clampStart,
  cleanSearch,
  isZohoId,
  mailboxBelongsTo,
  normalizeFolders,
  normalizeMessage,
  plain,
  stripActiveContent,
  zohoAccountsOrigin,
  zohoConsentUrl,
  zohoMailOrigin,
  ZOHO_MAIL_SCOPES,
} from "./mailbox.ts"
import { openToken, sealToken, tokenKeyProblem } from "./tokenBox.ts"

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  }
}

function safeReturnTo(raw: unknown): string | null {
  try {
    const url = new URL(String(raw || ""))
    return allowedOrigins().includes(url.origin) ? url.toString() : null
  } catch {
    return null
  }
}

function backTo(returnTo: string, params: Record<string, string>): Response {
  const url = new URL(returnTo)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store" } })
}

function page(status: number, text: string): Response {
  const safe = text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Mail</title><p style="font-family:system-ui;margin:40px">${safe}</p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  )
}

class MailError extends Error {
  constructor(public status: number, message: string, public setup = false) {
    super(message)
  }
}

type App = { clientId: string; clientSecret: string; tokenKey: string; accountsOrigin: string }

function zohoApp(): App | null {
  const clientId = Deno.env.get("ZOHO_MAIL_CLIENT_ID") || ""
  const clientSecret = Deno.env.get("ZOHO_MAIL_CLIENT_SECRET") || ""
  const tokenKey = Deno.env.get("MAIL_TOKEN_KEY") || ""
  if (!clientId || !clientSecret || tokenKeyProblem(tokenKey)) return null
  const accountsOrigin = zohoAccountsOrigin(Deno.env.get("ZOHO_ACCOUNTS_DOMAIN") || "https://accounts.zoho.com") ||
    "https://accounts.zoho.com"
  return { clientId, clientSecret, tokenKey, accountsOrigin }
}

const NOT_SET_UP = "Mail is not set up yet. An admin adds ZOHO_MAIL_CLIENT_ID, ZOHO_MAIL_CLIENT_SECRET and MAIL_TOKEN_KEY in Supabase (docs/mail.md)."

type Row = {
  user_email: string
  account_email: string
  zoho_account_id: string
  accounts_domain: string
  mail_domain: string
  refresh_token_enc: string
}

type Box = { mail: string; accountId: string; token: string }

// Access tokens per person, kept in this instance's memory only, never sent to the browser.
const tokens = new Map<string, { token: string; expiresAt: number; stamp: string }>()

async function zohoToken(accountsOrigin: string, body: Record<string, string>) {
  const res = await fetch(`${accountsOrigin}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20_000),
  })
  return (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }
}

async function revoke(accountsOrigin: string, refreshToken: string) {
  await fetch(`${accountsOrigin}/oauth/v2/token/revoke?${new URLSearchParams({ token: refreshToken })}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {})
}

async function loadRow(sb: SupabaseClient, email: string): Promise<Row | null> {
  const { data, error } = await sb
    .from("mail_accounts")
    .select("user_email, account_email, zoho_account_id, accounts_domain, mail_domain, refresh_token_enc")
    .eq("user_email", email)
    .maybeSingle()
  if (error) {
    if (/mail_accounts/.test(error.message || "") && /exist|schema cache/i.test(error.message || "")) {
      throw new MailError(409, "Mail is not set up yet. An admin runs the mail_accounts SQL from the SQL copy page.", true)
    }
    throw new Error("Could not read your mailbox connection")
  }
  return (data as Row | null) || null
}

async function myBox(sb: SupabaseClient, app: App, email: string): Promise<Box> {
  const row = await loadRow(sb, email)
  if (!row) throw new MailError(409, "Connect your Zoho mailbox first.", true)
  const accountsOrigin = zohoAccountsOrigin(row.accounts_domain)
  const mailOrigin = accountsOrigin ? zohoMailOrigin(accountsOrigin) : null
  if (!accountsOrigin || !mailOrigin || !isZohoId(row.zoho_account_id)) {
    throw new MailError(409, "Your mailbox connection is incomplete. Disconnect and connect it again.", true)
  }
  const box = { mail: mailOrigin, accountId: row.zoho_account_id }
  const hit = tokens.get(email)
  if (hit && hit.stamp === row.refresh_token_enc && hit.expiresAt > Date.now() + 60_000) return { ...box, token: hit.token }

  const refreshToken = await openToken(app.tokenKey, row.refresh_token_enc)
  if (!refreshToken) throw new MailError(409, "Your saved mailbox key cannot be opened (the key changed). Connect your mailbox again.", true)
  const tok = await zohoToken(accountsOrigin, {
    grant_type: "refresh_token",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: refreshToken,
  })
  if (!tok.access_token) {
    throw new MailError(409, `Zoho did not accept your saved key${tok.error ? ` (${tok.error})` : ""}. Connect your mailbox again.`, true)
  }
  tokens.set(email, {
    token: tok.access_token,
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    stamp: row.refresh_token_enc,
  })
  return { ...box, token: tok.access_token }
}

async function zohoGet(email: string, box: Box, path: string, params?: Record<string, string>): Promise<unknown> {
  const qs = params ? `?${new URLSearchParams(params)}` : ""
  const res = await fetch(`${box.mail}/api/accounts/${encodeURIComponent(box.accountId)}${path}${qs}`, {
    headers: { Authorization: `Zoho-oauthtoken ${box.token}` },
    signal: AbortSignal.timeout(25_000),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; status?: { description?: string } }
  if (res.status === 401) {
    tokens.delete(email)
    throw new MailError(409, "Zoho refused your mailbox key. Connect your mailbox again.", true)
  }
  if (!res.ok) throw new MailError(502, body.status?.description || `Zoho Mail answered ${res.status}`)
  return body.data
}

const rows = (data: unknown) => (Array.isArray(data) ? (data as Record<string, unknown>[]) : [])

/** Zoho's answer after the person agrees. Checks the signed state, then that the mailbox is theirs. */
async function callback(req: Request, sb: SupabaseClient, app: App | null, redirectUri: string): Promise<Response> {
  const params = new URL(req.url).searchParams
  if (!app) return page(503, NOT_SET_UP)
  const state = await readState(app.clientSecret, params.get("state") || "")
  if (!state) return page(400, "This link has expired. Go back to Mail in RR Central and connect again.")
  const returnTo = safeReturnTo(state.returnTo)
  if (!returnTo) return page(400, "This link is not for RR Central.")
  const email = state.email.toLowerCase()
  const { data: member } = await sb
    .from("app_users")
    .select("role, active")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle()
  if (!member?.active || !["admin", "manager", "sales"].includes(String(member.role))) {
    return backTo(returnTo, { mail: "error", reason: "Your role cannot use Mail" })
  }
  const code = params.get("code") || ""
  if (!code) {
    return backTo(returnTo, { mail: "error", reason: params.get("error") === "access_denied" ? "Zoho access was not given" : "Zoho gave no answer" })
  }
  // Zoho says which region the person's account lives in; only Zoho's own servers are accepted.
  const accountsOrigin = zohoAccountsOrigin(params.get("accounts-server") || app.accountsOrigin)
  if (!accountsOrigin) return backTo(returnTo, { mail: "error", reason: "Zoho answered from an unknown server" })

  const tok = await zohoToken(accountsOrigin, {
    grant_type: "authorization_code",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: redirectUri,
    code,
  })
  if (!tok.access_token || !tok.refresh_token) {
    return backTo(returnTo, { mail: "error", reason: `Zoho gave no lasting access${tok.error ? ` (${tok.error})` : ""}. Try again.` })
  }
  const mailOrigin = zohoMailOrigin(accountsOrigin)
  const accRes = await fetch(`${mailOrigin}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` },
    signal: AbortSignal.timeout(20_000),
  })
  const accBody = (await accRes.json().catch(() => ({}))) as { data?: Record<string, unknown>[] }
  const account = (accBody.data || []).find((a) => mailboxBelongsTo(email, a))
  if (!accRes.ok || !account || !isZohoId(String(account.accountId ?? ""))) {
    await revoke(accountsOrigin, tok.refresh_token)
    return backTo(returnTo, {
      mail: "error",
      reason: `That Zoho mailbox is not ${email}. Sign in to Zoho as ${email} and connect again.`,
    })
  }

  const old = await loadRow(sb, email).catch(() => null)
  const { error } = await sb.from("mail_accounts").upsert(
    {
      user_email: email,
      provider: "zoho",
      account_email: String(account.primaryEmailAddress || account.mailboxAddress || email).toLowerCase(),
      zoho_account_id: String(account.accountId),
      accounts_domain: accountsOrigin,
      mail_domain: mailOrigin,
      refresh_token_enc: await sealToken(app.tokenKey, tok.refresh_token),
      scopes: ZOHO_MAIL_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" },
  )
  if (error) {
    await revoke(accountsOrigin, tok.refresh_token)
    return backTo(returnTo, { mail: "error", reason: "Could not save your mailbox connection. Has the mail_accounts SQL been run?" })
  }
  // The earlier key for this person is no longer needed.
  if (old) {
    const previous = await openToken(app.tokenKey, old.refresh_token_enc)
    const oldOrigin = zohoAccountsOrigin(old.accounts_domain)
    if (previous && oldOrigin && previous !== tok.refresh_token) await revoke(oldOrigin, previous)
  }
  tokens.delete(email)
  return backTo(returnTo, { mail: "connected" })
}

Deno.serve(withErrorLog("mail-inbox", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)
  const app = zohoApp()
  const redirectUri = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/mail-inbox`
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  if (req.method === "GET") return callback(req, sb, app, redirectUri)
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const origin = req.headers.get("Origin")
  if (origin && !allowedOrigins().includes(origin)) return json({ error: "Origin not allowed" }, 403)

  // Verify JWT is off for this function, so check the signed in user here, before anything else.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)
  // Admin, manager and sales only: staff (assigned accounts) and viewers do not use Mail.
  const { data: isStaff } = await userDb.rpc("rr_is_staff")
  if (isStaff !== true) return json({ error: "Your role cannot use Mail" }, 403)
  const email = String(who.user.email || "").toLowerCase()
  if (!email) return json({ error: "Your login has no email address" }, 403)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || "status")

  try {
    if (action === "status") {
      if (!app) return json({ ready: false, connected: false, address: "" })
      const row = await loadRow(sb, email)
      return json({ ready: true, connected: Boolean(row), address: row?.account_email || "" })
    }
    if (!app) return json({ error: NOT_SET_UP, setup: true }, 409)

    if (action === "connect") {
      const returnTo = safeReturnTo(body.return_to)
      if (!returnTo) return json({ error: "Open Mail from RR Central to connect" }, 400)
      const state = await signState(app.clientSecret, { email, returnTo, exp: Date.now() + 15 * 60_000 })
      return json({ url: zohoConsentUrl({ accountsOrigin: app.accountsOrigin, clientId: app.clientId, redirectUri, state, loginHint: email }) })
    }

    if (action === "disconnect") {
      const row = await loadRow(sb, email)
      if (row) {
        const refreshToken = await openToken(app.tokenKey, row.refresh_token_enc)
        const accountsOrigin = zohoAccountsOrigin(row.accounts_domain)
        if (refreshToken && accountsOrigin) await revoke(accountsOrigin, refreshToken)
        await sb.from("mail_accounts").delete().eq("user_email", email)
      }
      tokens.delete(email)
      return json({ ok: true })
    }

    if (action === "folders") {
      const box = await myBox(sb, app, email)
      return json({ folders: normalizeFolders(rows(await zohoGet(email, box, "/folders"))) })
    }

    if (action === "list") {
      if (!isZohoId(body.folderId)) return json({ error: "Pick a folder" }, 400)
      const box = await myBox(sb, app, email)
      const data = await zohoGet(email, box, "/messages/view", {
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
      const box = await myBox(sb, app, email)
      const data = await zohoGet(email, box, "/messages/search", {
        searchKey: `entire:${q}`,
        start: String(clampStart(body.start)),
        limit: String(clampLimit(body.limit)),
        includeto: "true",
      })
      return json({ messages: rows(data).map(normalizeMessage).filter(Boolean) })
    }

    if (action === "message") {
      if (!isZohoId(body.folderId) || !isZohoId(body.messageId)) return json({ error: "Pick an email" }, 400)
      const box = await myBox(sb, app, email)
      const base = `/folders/${body.folderId}/messages/${body.messageId}`
      const [details, content] = await Promise.all([zohoGet(email, box, `${base}/details`), zohoGet(email, box, `${base}/content`)])
      const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>
      const head = normalizeMessage({ ...d, messageId: body.messageId, folderId: body.folderId })
      const html = String(((content && typeof content === "object" ? content : {}) as { content?: unknown }).content || "")
      return json({ message: { ...head, ccAddress: plain(d.ccAddress, 1000), html: stripActiveContent(html) } })
    }

    return json({ error: "Unknown action" }, 400)
  } catch (e) {
    if (e instanceof MailError) return json({ error: e.message, setup: e.setup || undefined }, e.status)
    console.error("mail-inbox failed", e instanceof Error ? e.message : e)
    return json({ error: "Zoho Mail could not be reached. Please try again." }, 502)
  }
}, { secrets: ["ZOHO_MAIL_CLIENT_ID", "ZOHO_MAIL_CLIENT_SECRET", "MAIL_TOKEN_KEY"] }))
