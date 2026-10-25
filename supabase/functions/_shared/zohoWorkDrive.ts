// Put a file in a Zoho WorkDrive folder with the Zoho connection saved in
// Settings (Client ID, Client Secret, Refresh Token, WorkDrive set to yes).
// Returns null while WorkDrive is not set up. Same upload as zoho-proxy.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

const ACCOUNTS_HOST_RE = /^accounts\.zoho\.(com|eu|in|com\.au|jp|com\.cn|sa|ca)$/i
const API_HOST_RE = /^(www\.)?zohoapis\.(com|eu|in|com\.au|jp|com\.cn|sa|ca)$/i

function origin(raw: string, re: RegExp): string {
  const url = new URL(raw)
  if (url.protocol !== "https:" || !re.test(url.hostname)) throw new Error(`Zoho host not allowed: ${url.hostname}`)
  return url.origin
}

function apiBase(s: Record<string, string>): string {
  if (s.zohoWorkDriveApiDomain) return origin(s.zohoWorkDriveApiDomain, API_HOST_RE)
  const accounts = s.zohoAccountsDomain || ""
  if (accounts.includes("zoho.eu")) return "https://www.zohoapis.eu"
  if (accounts.includes("zoho.in")) return "https://www.zohoapis.in"
  if (accounts.includes("zoho.com.au")) return "https://www.zohoapis.com.au"
  return "https://www.zohoapis.com"
}

export type WorkDriveSaved = { id: string; url: string }

export async function workDriveUploader(sb: SupabaseClient) {
  const { data } = await sb
    .from("app_settings")
    .select("key, value")
    .in("key", ["zohoClientId", "zohoClientSecret", "zohoRefreshToken", "zohoAccountsDomain", "zohoWorkDriveApiDomain", "zohoWorkDriveEnabled"])
  const s: Record<string, string> = {}
  for (const row of (data || []) as { key: string; value: string }[]) s[row.key] = String(row.value ?? "").trim()
  if (!s.zohoClientId || !s.zohoClientSecret || !s.zohoRefreshToken || (s.zohoWorkDriveEnabled || "no").toLowerCase() !== "yes") {
    return null
  }
  const accounts = origin(s.zohoAccountsDomain || "https://accounts.zoho.com", ACCOUNTS_HOST_RE)
  const api = apiBase(s)

  return async (file: { folderId: string; filename: string; contentType: string; bytes: Uint8Array }): Promise<WorkDriveSaved> => {
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
    const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string }
    if (!token.access_token) throw new Error(`Zoho sign in failed${token.error ? `: ${token.error}` : ""}`)

    const form = new FormData()
    form.append("parent_id", file.folderId)
    form.append("override-name-exist", "false")
    form.append("content", new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.contentType || "application/octet-stream" }), file.filename)
    const res = await fetch(`${api}/workdrive/api/v1/upload`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    const body = (await res.json().catch(() => ({}))) as {
      data?: { attributes?: Record<string, string> }[] | { attributes?: Record<string, string> }
      errors?: { title?: string }[]
    }
    if (!res.ok) throw new Error(body.errors?.[0]?.title || `WorkDrive answered ${res.status}`)
    const row = Array.isArray(body.data) ? body.data[0] : body.data
    const attrs = row?.attributes || {}
    const id = attrs.resource_id || ""
    if (!id) throw new Error("WorkDrive took the file but gave no file id")
    return { id, url: attrs.Permalink || attrs.permalink || `https://workdrive.zoho.com/file/${id}` }
  }
}
