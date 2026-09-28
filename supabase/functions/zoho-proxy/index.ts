// Zoho API proxy — browsers cannot call Zoho OAuth/Mail/WorkDrive APIs directly (CORS → 405).
// Deploy: supabase functions deploy zoho-proxy --project-ref <your-ref>
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const ALLOWED_HOST_RE =
  /^([a-z0-9-]+\.)*(zoho\.com|zoho\.eu|zoho\.in|zoho\.com\.au|zohoapis\.com|zohoapis\.eu|zohoapis\.in|upload\.zoho\.com|upload\.zoho\.eu|upload\.zoho\.in)$/i

// Sites allowed to call this function from a browser. Override with the
// ALLOWED_ORIGINS secret (comma-separated).
const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  if (!raw) return DEFAULT_ORIGINS
  return raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean)
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || ""
  const allowed = allowedOrigins()
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) throw new Error("Function is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Only active RR Central team members (rows in app_users) may use the proxy.
 * The anon key alone is not enough — it ships in the public website bundle.
 */
async function requireStaff(req: Request): Promise<ReturnType<typeof adminClient>> {
  const auth = req.headers.get("Authorization") || ""
  const jwt = auth.replace(/^Bearer\s+/i, "").trim()
  if (!jwt) throw new HttpError(401, "Sign in to RR Central first")
  const admin = adminClient()
  const { data, error } = await admin.auth.getUser(jwt)
  const email = data?.user?.email?.toLowerCase()
  if (error || !email || !data.user.email_confirmed_at) {
    throw new HttpError(401, "Sign in to RR Central first")
  }
  const { data: member } = await admin
    .from("app_users")
    .select("active")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle()
  if (!member?.active) throw new HttpError(403, "Your account does not have access to RR Central")
  return admin
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Zoho secrets live in app_settings (admin-only via RLS); load them server-side. */
async function loadZohoSecrets(admin: ReturnType<typeof adminClient>) {
  const { data } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", ["zohoClientId", "zohoClientSecret", "zohoRefreshToken", "zohoAccountsDomain"])
  const map: Record<string, string> = {}
  for (const row of (data || []) as { key: string; value: string }[]) map[row.key] = row.value
  return map
}

function assertZohoUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("Invalid Zoho URL")
  }
  if (url.protocol !== "https:") throw new Error("Zoho URL must be https")
  if (!ALLOWED_HOST_RE.test(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`)
  }
  return url
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const cleaned = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "")
  const bin = atob(cleaned)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors })
  }
  const res = await handle(req)
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
  return res
})

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" })
  }

  const origin = req.headers.get("Origin")
  if (origin && !allowedOrigins().includes(origin)) {
    return json(403, { error: "Origin not allowed" })
  }

  try {
    const admin = await requireStaff(req)
    const payload = (await req.json()) as {
      action?: string
      accountsDomain?: string
      clientId?: string
      clientSecret?: string
      refreshToken?: string
      url?: string
      method?: string
      headers?: Record<string, string>
      body?: string | null
      /** WorkDrive multipart upload (base64 file body). */
      parentId?: string
      filename?: string
      contentBase64?: string
      contentType?: string
      authorization?: string
    }

    const action = payload.action || "token"

    if (action === "token") {
      // Sales users cannot read the secrets (RLS), so fill them in here.
      const stored = await loadZohoSecrets(admin)
      const accountsDomain = String(
        payload.accountsDomain || stored.zohoAccountsDomain || "https://accounts.zoho.com",
      ).replace(/\/$/, "")
      assertZohoUrl(`${accountsDomain}/oauth/v2/token`)
      const clientId = String(payload.clientId || stored.zohoClientId || "").trim()
      const clientSecret = String(payload.clientSecret || stored.zohoClientSecret || "").trim()
      const refreshToken = String(payload.refreshToken || stored.zohoRefreshToken || "").trim()
      if (!clientId || !clientSecret || !refreshToken) {
        return json(400, { error: "clientId, clientSecret, and refreshToken are required" })
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      })

      const res = await fetch(`${accountsDomain}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      })
      const data = await res.json().catch(() => ({}))
      return json(200, { ...(data as Record<string, unknown>), _httpStatus: res.status })
    }

    if (action === "api") {
      const target = assertZohoUrl(String(payload.url || ""))
      const method = String(payload.method || "GET").toUpperCase()
      const headers = new Headers(payload.headers || {})
      headers.delete("host")
      headers.delete("content-length")

      const res = await fetch(target.toString(), {
        method,
        headers,
        body: payload.body == null || method === "GET" || method === "HEAD" ? undefined : payload.body,
      })
      const text = await res.text()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        /* keep text */
      }
      return json(200, { ok: res.ok, status: res.status, body: parsed })
    }

    if (action === "upload") {
      const target = assertZohoUrl(
        String(payload.url || "https://www.zohoapis.com/workdrive/api/v1/upload"),
      )
      const parentId = String(payload.parentId || "").trim()
      const filename = String(payload.filename || "file.bin").trim()
      const auth = String(payload.authorization || payload.headers?.Authorization || "").trim()
      const contentBase64 = String(payload.contentBase64 || "")
      if (!parentId) return json(400, { error: "parentId is required" })
      if (!auth) return json(400, { error: "authorization is required" })
      if (!contentBase64) return json(400, { error: "contentBase64 is required" })

      const bytes = base64ToBytes(contentBase64)
      const form = new FormData()
      form.append("parent_id", parentId)
      form.append("override-name-exist", "true")
      form.append(
        "content",
        new Blob([bytes], { type: payload.contentType || "application/octet-stream" }),
        filename,
      )

      const res = await fetch(target.toString(), {
        method: "POST",
        headers: { Authorization: auth },
        body: form,
      })
      const text = await res.text()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        /* keep text */
      }
      return json(200, { ok: res.ok, status: res.status, body: parsed })
    }

    return json(400, { error: `Unknown action: ${action}` })
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message })
    console.error("zoho-proxy failed", e)
    return json(500, { error: e instanceof Error ? e.message : "Proxy failed" })
  }
}
