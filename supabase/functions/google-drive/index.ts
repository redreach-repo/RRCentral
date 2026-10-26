// Google Drive for RR Central: connect once, then client folders and uploads.
// Replaces Zoho WorkDrive. Verify JWT is off (supabase/config.toml) because
// Google's sign in comes back here as a plain GET; every other call checks
// the signed in user in code, and the GET checks the signed state.
//
//   POST { action: "status" }                         any team member
//   POST { action: "connect", return_to }             admin -> { url } to Google
//   GET  ?code=…&state=…                              Google's answer (signed state)
//   POST { action: "disconnect" }                     admin
//   POST { action: "client-folder", crm_id }          admin, manager, sales -> { id, url }
//   POST { action: "upload", crm_id, filename,
//          content_base64, content_type }             admin, manager, sales -> { id, url, folder_url }
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Google Cloud OAuth client).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import {
  accessToken,
  consentUrl,
  createFolder,
  driveAccountEmail,
  ensureClientFolder,
  exchangeCode,
  folderUrl,
  folderUsable,
  googleApp,
  loadConnection,
  readState,
  signState,
  uploadFile,
} from "../_shared/googleDrive.ts"

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

/** Only send people back to an RR Central page. */
export function safeReturnTo(raw: unknown): string | null {
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
  return new Response(`<!doctype html><meta charset="utf-8"><title>Google Drive</title><p style="font-family:system-ui;margin:40px">${safe}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const STATE_MINUTES = 15

Deno.serve(withErrorLog("google-drive", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)
  const app = googleApp()
  const redirectUri = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/google-drive`
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // ---- Google's answer after the admin said yes (or no) -------------------
  if (req.method === "GET") {
    const params = new URL(req.url).searchParams
    if (!app) return page(503, "Google Drive is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Supabase.")
    const state = await readState(app.clientSecret, params.get("state") || "")
    if (!state) return page(400, "This link has expired. Go back to RR Central Settings and click Connect Google Drive again.")
    const returnTo = safeReturnTo(state.returnTo)
    if (!returnTo) return page(400, "This link is not for RR Central.")
    const { data: admin } = await sb
      .from("app_users")
      .select("role, active")
      .ilike("email", state.email.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle()
    if (!admin?.active || admin.role !== "admin") return backTo(returnTo, { drive: "error", reason: "Only an admin can connect Google Drive" })
    const code = params.get("code") || ""
    if (!code) return backTo(returnTo, { drive: "error", reason: params.get("error") === "access_denied" ? "Google access was not given" : "Google gave no answer" })

    try {
      const tokens = await exchangeCode(app, code, redirectUri)
      const old = await loadConnection(sb)
      const refreshToken = tokens.refreshToken || old?.refresh_token || ""
      if (!refreshToken) throw new Error("Google gave no lasting access. Remove RR Central under myaccount.google.com/permissions and connect again.")
      const token = tokens.accessToken || (await accessToken(app, refreshToken))
      const email = await driveAccountEmail(token)

      // Keep the folders from before when this Google account can still see them.
      const keep = async (id: string | undefined) => (id && (await folderUsable(token, id)) ? id : "")
      let root = await keep(old?.root_folder_id)
      if (!root) root = (await createFolder(token, "RR Central")).id
      let customers = root === old?.root_folder_id ? await keep(old?.customers_folder_id) : ""
      if (!customers) customers = (await createFolder(token, "Customers", root)).id
      let company = root === old?.root_folder_id ? await keep(old?.company_folder_id) : ""
      if (!company) company = (await createFolder(token, "Company documents", root)).id

      const { error } = await sb.from("drive_connection").upsert({
        id: 1,
        refresh_token: refreshToken,
        account_email: email,
        root_folder_id: root,
        customers_folder_id: customers,
        company_folder_id: company,
        connected_by: state.email,
        connected_at: new Date().toISOString(),
      })
      if (error) throw new Error(`Could not save the connection: ${error.message}`)
      // Ordinary setting, so every page can link the company folder.
      await sb.from("app_settings").upsert({ key: "companyDriveFolderUrl", value: folderUrl(company) }, { onConflict: "key" })
      return backTo(returnTo, { drive: "connected" })
    } catch (e) {
      console.error("google-drive connect failed", e)
      return backTo(returnTo, { drive: "error", reason: String((e as Error).message || e).slice(0, 200) })
    }
  }

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
  const { data: isMember } = await userDb.rpc("rr_is_member")
  if (isMember !== true) return json({ error: "Your account does not have access to RR Central" }, 403)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || "status")

  if (action === "status") {
    const conn = await loadConnection(sb)
    return json({
      configured: Boolean(app),
      connected: Boolean(app && conn),
      account_email: conn?.account_email || "",
      root_url: folderUrl(conn?.root_folder_id || ""),
      customers_url: folderUrl(conn?.customers_folder_id || ""),
      company_url: folderUrl(conn?.company_folder_id || ""),
      redirect_uri: redirectUri,
    })
  }

  if (action === "connect" || action === "disconnect") {
    const { data: isAdmin } = await userDb.rpc("rr_is_admin")
    if (isAdmin !== true) return json({ error: "Only an admin can connect or disconnect Google Drive" }, 403)
    if (action === "disconnect") {
      const conn = await loadConnection(sb)
      if (conn) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, { method: "POST" })
          .then((r) => r.body?.cancel())
          .catch(() => {})
      }
      await sb.from("drive_connection").delete().eq("id", 1)
      return json({ ok: true })
    }
    if (!app) return json({ error: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Supabase first" }, 503)
    const returnTo = safeReturnTo(body.return_to)
    if (!returnTo) return json({ error: "Open RR Central from its usual address and try again" }, 400)
    const state = await signState(app.clientSecret, {
      email: String(who.user.email || "").toLowerCase(),
      returnTo,
      exp: Date.now() + STATE_MINUTES * 60_000,
    })
    return json({ url: consentUrl(app.clientId, redirectUri, state) })
  }

  if (action !== "client-folder" && action !== "upload") return json({ error: "Unknown action" }, 400)

  // Day to day roles only (admin, manager, sales), as for the rest of customer files.
  const { data: isStaff } = await userDb.rpc("rr_is_staff")
  if (isStaff !== true) return json({ error: "Your role cannot add files to Google Drive" }, 403)
  const crmId = typeof body.crm_id === "string" && UUID.test(body.crm_id) ? body.crm_id : ""
  if (!crmId) return json({ error: "Save this company in CRM first" }, 400)
  if (!app) return json({ error: "Google Drive is not set up yet. An admin connects it in Settings." }, 503)
  const conn = await loadConnection(sb)
  if (!conn) return json({ error: "Google Drive is not connected yet. An admin connects it in Settings." }, 503)

  // Read the CRM row as the user, so they only reach companies they can see.
  const { data: crm } = await userDb.from("crm").select("id, company_name, drive_folder_url").eq("id", crmId).maybeSingle()
  if (!crm) return json({ error: "Company not found" }, 404)

  const token = await accessToken(app, conn.refresh_token)
  const folder = await ensureClientFolder(sb, token, conn, crm as { id: string; company_name: string; drive_folder_url: string })
  if (action === "client-folder") return json({ id: folder.id, url: folder.url })

  const filename = String(body.filename || "").trim().slice(0, 200)
  const content = typeof body.content_base64 === "string" ? body.content_base64.replace(/\s/g, "") : ""
  if (!filename) return json({ error: "The file needs a name" }, 400)
  if (!content || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) return json({ error: "The file could not be read" }, 400)
  if ((content.length * 3) / 4 > MAX_UPLOAD_BYTES) return json({ error: "The file is over 10 MB" }, 400)
  const bin = atob(content)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const saved = await uploadFile(token, {
    folderId: folder.id,
    filename,
    contentType: String(body.content_type || "application/octet-stream").slice(0, 100),
    bytes,
  })
  return json({ id: saved.id, url: saved.url, folder_url: folder.url })
}, { secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] }))
