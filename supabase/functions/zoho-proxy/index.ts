// Zoho API proxy — browsers cannot call Zoho OAuth/Mail/WorkDrive APIs directly (CORS → 405).
// Deploy: supabase functions deploy zoho-proxy --project-ref <your-ref>
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ALLOWED_HOST_RE =
  /^([a-z0-9-]+\.)*(zoho\.com|zoho\.eu|zoho\.in|zoho\.com\.au|zohoapis\.com|zohoapis\.eu|zohoapis\.in|upload\.zoho\.com|upload\.zoho\.eu|upload\.zoho\.in)$/i

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
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

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "")
  const bin = atob(cleaned)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" })
  }

  try {
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
      const accountsDomain = String(payload.accountsDomain || "https://accounts.zoho.com").replace(
        /\/$/,
        "",
      )
      assertZohoUrl(`${accountsDomain}/oauth/v2/token`)
      const clientId = String(payload.clientId || "").trim()
      const clientSecret = String(payload.clientSecret || "").trim()
      const refreshToken = String(payload.refreshToken || "").trim()
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
    return json(500, { error: e instanceof Error ? e.message : "Proxy failed" })
  }
})
