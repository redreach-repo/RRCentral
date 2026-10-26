// Google Drive for RR Central: the connection an admin makes once in
// Settings (Connect Google Drive), folders per client, and file uploads.
//
// The app's Google sign in is GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
// (Supabase Edge Function secrets). The refresh token and the folder ids live
// in the drive_connection table, which only Edge Functions can read.
// Scope is drive.file: RR Central sees only the folders and files it made.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const API = "https://www.googleapis.com/drive/v3"
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
const FOLDER_MIME = "application/vnd.google-apps.folder"

export type DriveConnection = {
  refresh_token: string
  account_email: string
  root_folder_id: string
  customers_folder_id: string
  company_folder_id: string
}

export type DriveSaved = { id: string; url: string }

export function googleApp(): { clientId: string; clientSecret: string } | null {
  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") || "").trim()
  const clientSecret = (Deno.env.get("GOOGLE_CLIENT_SECRET") || "").trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function folderUrl(id: string): string {
  return id ? `https://drive.google.com/drive/folders/${id}` : ""
}

/** The folder id in a Google Drive folder link (or a bare id). Other hosts give null. */
export function driveFolderId(url: string): string | null {
  const u = String(url || "").trim()
  if (!u) return null
  if (!u.includes("://")) return /^[A-Za-z0-9_-]{15,}$/.test(u) ? u : null
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com") return null
  const m = parsed.pathname.match(/\/folders\/([A-Za-z0-9_-]{15,})/) || null
  if (m) return m[1]
  const id = parsed.searchParams.get("id") || ""
  return /^[A-Za-z0-9_-]{15,}$/.test(id) ? id : null
}

/** Names Drive is happy with, and short enough to read. */
export function safeName(name: string, fallback = "file"): string {
  return String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || fallback
}

export function consentUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  })
  return `${AUTH_URL}?${q}`
}

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64url(text: string): string {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function unb64url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/")
  return decodeURIComponent(escape(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))))
}

export type ConnectState = { email: string; returnTo: string; exp: number }

/** Signed so the Google callback knows which admin started it, and when. */
export async function signState(secret: string, state: ConnectState): Promise<string> {
  const body = b64url(JSON.stringify(state))
  return `${body}.${await hmac(secret, body)}`
}

export async function readState(secret: string, raw: string, now = Date.now()): Promise<ConnectState | null> {
  const [body, sig] = String(raw || "").split(".")
  if (!body || !sig || sig !== (await hmac(secret, body))) return null
  try {
    const state = JSON.parse(unb64url(body)) as ConnectState
    if (typeof state.email !== "string" || typeof state.returnTo !== "string" || !(state.exp > now)) return null
    return state
  } catch {
    return null
  }
}

async function googleJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = body.error as { message?: string } | string | undefined
    const msg = typeof err === "string" ? `${err}${body.error_description ? `: ${body.error_description}` : ""}` : err?.message
    throw new Error(`Google Drive answered ${res.status}${msg ? `: ${msg}` : ""}`)
  }
  return body
}

export async function exchangeCode(app: { clientId: string; clientSecret: string }, code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await googleJson(res)
  return { accessToken: String(body.access_token || ""), refreshToken: String(body.refresh_token || "") }
}

export async function accessToken(app: { clientId: string; clientSecret: string }, refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await googleJson(res).catch((e) => {
    throw new Error(`Google sign in failed. Connect Google Drive again in Settings. (${(e as Error).message})`)
  })
  const token = String(body.access_token || "")
  if (!token) throw new Error("Google sign in gave no access token")
  return token
}

export async function driveAccountEmail(token: string): Promise<string> {
  const res = await fetch(`${API}/about?fields=user(emailAddress)`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await googleJson(res)
  return String((body.user as { emailAddress?: string } | undefined)?.emailAddress || "")
}

export async function createFolder(token: string, name: string, parentId?: string): Promise<DriveSaved> {
  const res = await fetch(`${API}/files?fields=id,webViewLink&supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: safeName(name, "Folder"), mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await googleJson(res)
  const id = String(body.id || "")
  if (!id) throw new Error("Google Drive made the folder but gave no id")
  return { id, url: String(body.webViewLink || "") || folderUrl(id) }
}

/** True when RR Central can still see the folder (not deleted or in the bin). */
export async function folderUsable(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${API}/files/${encodeURIComponent(id)}?fields=id,trashed,mimeType&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    await res.body?.cancel()
    return false
  }
  const body = (await res.json().catch(() => ({}))) as { trashed?: boolean; mimeType?: string }
  return !body.trashed && body.mimeType === FOLDER_MIME
}

/** Resumable upload: one call for the name and folder, one for the bytes. Works for any size. */
export async function uploadFile(
  token: string,
  file: { folderId: string; filename: string; contentType: string; bytes: Uint8Array },
): Promise<DriveSaved> {
  const type = file.contentType || "application/octet-stream"
  const start = await fetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id,webViewLink&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": type,
    },
    body: JSON.stringify({ name: safeName(file.filename), parents: [file.folderId] }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!start.ok) await googleJson(start)
  await start.body?.cancel()
  const session = start.headers.get("Location")
  if (!session) throw new Error("Google Drive did not start the upload")
  const res = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: file.bytes as Uint8Array<ArrayBuffer>,
    signal: AbortSignal.timeout(60_000),
  })
  const body = await googleJson(res)
  const id = String(body.id || "")
  if (!id) throw new Error("Google Drive took the file but gave no file id")
  return { id, url: String(body.webViewLink || "") || `https://drive.google.com/file/d/${id}/view` }
}

export async function loadConnection(sb: SupabaseClient): Promise<DriveConnection | null> {
  const { data } = await sb
    .from("drive_connection")
    .select("refresh_token, account_email, root_folder_id, customers_folder_id, company_folder_id")
    .eq("id", 1)
    .maybeSingle()
  const row = data as DriveConnection | null
  return row?.refresh_token ? row : null
}

/**
 * The client's folder under RR Central / Customers. Uses the folder already on
 * the CRM row when it is a Google Drive folder RR Central can still see;
 * otherwise makes one and saves its link on the CRM row.
 */
export async function ensureClientFolder(
  sb: SupabaseClient,
  token: string,
  conn: DriveConnection,
  crm: { id: string; company_name: string; drive_folder_url?: string | null },
): Promise<DriveSaved> {
  const existing = driveFolderId(crm.drive_folder_url || "")
  if (existing && (await folderUsable(token, existing))) return { id: existing, url: crm.drive_folder_url || folderUrl(existing) }
  if (!conn.customers_folder_id) throw new Error("Connect Google Drive again in Settings so RR Central can make its Customers folder")
  const made = await createFolder(token, safeName(crm.company_name, "Client"), conn.customers_folder_id)
  await sb.from("crm").update({ drive_folder_url: made.url }).eq("id", crm.id)
  return made
}

/**
 * Uploads into a client's folder with the saved connection. Returns null while
 * Google Drive is not connected. Used by the client portal for uploads.
 */
export async function driveUploader(sb: SupabaseClient) {
  const app = googleApp()
  const conn = await loadConnection(sb)
  if (!app || !conn) return null
  let token = ""
  return {
    async ensureClientFolder(crm: { id: string; company_name: string; drive_folder_url?: string | null }) {
      token ||= await accessToken(app, conn.refresh_token)
      return ensureClientFolder(sb, token, conn, crm)
    },
    async upload(file: { folderId: string; filename: string; contentType: string; bytes: Uint8Array }) {
      token ||= await accessToken(app, conn.refresh_token)
      return uploadFile(token, file)
    },
  }
}
