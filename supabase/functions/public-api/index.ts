/**
 * Public API (M11 deepen).
 * GET /public-api              → health
 * GET /public-api/v1/me        → key metadata (x-api-key)
 * GET /public-api/v1/accounts  → account list (read:accounts)
 *
 * Deploy with verify_jwt = false; auth is via hashed api_keys.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

type ApiKeyRow = {
  id: string
  tenant_id: string
  name: string
  key_prefix: string
  key_hash: string
  scopes: unknown
  revoked_at: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function pathOf(req: Request): string {
  const url = new URL(req.url)
  // Function is mounted at /functions/v1/public-api
  return url.pathname.replace(/^\/functions\/v1\/public-api/, "") || "/"
}

function scopesOf(row: ApiKeyRow): string[] {
  if (Array.isArray(row.scopes)) return row.scopes.map(String)
  return []
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const path = pathOf(req)

  if (req.method === "GET" && (path === "/" || path === "")) {
    return json({
      ok: true,
      product: "HighMast",
      api: "public-api",
      version: "0.2.0",
      routes: ["GET /", "GET /v1/me", "GET /v1/accounts"],
    })
  }

  const apiKey = req.headers.get("x-api-key") || ""
  if (!apiKey.startsWith("hm_")) {
    return json({ error: "missing_or_invalid_api_key" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "server_misconfigured" }, 500)
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const prefix = apiKey.slice(0, 10)
  const hash = await sha256Hex(apiKey)

  const { data: keyRow, error: keyErr } = await sb
    .from("api_keys")
    .select("id, tenant_id, name, key_prefix, key_hash, scopes, revoked_at")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .maybeSingle()

  if (keyErr) return json({ error: "auth_lookup_failed", detail: keyErr.message }, 500)
  if (!keyRow || keyRow.key_hash !== hash) return json({ error: "unauthorized" }, 401)

  const key = keyRow as ApiKeyRow
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id)

  if (req.method === "GET" && path === "/v1/me") {
    return json({
      key_id: key.id,
      name: key.name,
      prefix: key.key_prefix,
      scopes: scopesOf(key),
      tenant_id: key.tenant_id,
    })
  }

  if (req.method === "GET" && path === "/v1/accounts") {
    const scopes = scopesOf(key)
    if (!scopes.includes("read:accounts") && !scopes.includes("*")) {
      return json({ error: "forbidden_scope", need: "read:accounts" }, 403)
    }
    const { data, error } = await sb
      .from("accounts")
      .select("id, name, type, status, reference")
      .eq("tenant_id", key.tenant_id)
      .order("name")
      .limit(100)
    if (error) {
      // Older DBs may lack tenant_id on accounts — fall back to unscoped staff list capped.
      const fallback = await sb.from("accounts").select("id, name, type, status, reference").order("name").limit(100)
      if (fallback.error) return json({ error: "query_failed", detail: error.message }, 500)
      return json({ data: fallback.data || [], truncated: true })
    }
    return json({ data: data || [] })
  }

  return json({ error: "not_found", path }, 404)
})
