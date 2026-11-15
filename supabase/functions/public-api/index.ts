/**
 * Public API (M11 deepen).
 * GET /public-api                 → health
 * GET /public-api/v1/me           → key metadata (x-api-key)
 * GET /public-api/v1/accounts     → accounts (read:accounts)
 * GET /public-api/v1/invoices     → invoices (read:invoices)
 * GET /public-api/v1/quotations   → quotations (read:quotations)
 *
 * List routes support ?limit=1..100&cursor=<last-id>.
 * Deploy with verify_jwt = false; auth is via hashed api_keys (x-api-key).
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
  return url.pathname.replace(/^\/functions\/v1\/public-api/, "") || "/"
}

function scopesOf(row: ApiKeyRow): string[] {
  if (Array.isArray(row.scopes)) return row.scopes.map(String)
  return []
}

function hasScope(scopes: string[], need: string): boolean {
  return scopes.includes("*") || scopes.includes(need)
}

function parsePage(url: URL): { limit: number; cursor: string | null } {
  const raw = Number(url.searchParams.get("limit") || 50)
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 50
  const cursor = String(url.searchParams.get("cursor") || "").trim() || null
  return { limit, cursor }
}

function nextCursor(rows: Array<{ id: string }>, limit: number): string | null {
  if (rows.length < limit || !rows.length) return null
  return rows[rows.length - 1]?.id || null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const url = new URL(req.url)
  const path = pathOf(req)

  if (req.method === "GET" && (path === "/" || path === "")) {
    return json({
      ok: true,
      product: "HighMast",
      api: "public-api",
      version: "0.3.0",
      routes: [
        "GET /",
        "GET /v1/me",
        "GET /v1/accounts",
        "GET /v1/invoices",
        "GET /v1/quotations",
      ],
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
  const scopes = scopesOf(key)

  if (req.method === "GET" && path === "/v1/me") {
    return json({
      key_id: key.id,
      name: key.name,
      prefix: key.key_prefix,
      scopes,
      tenant_id: key.tenant_id,
    })
  }

  async function listResource(
    needScope: string,
    table: string,
    columns: string,
  ): Promise<Response> {
    if (!hasScope(scopes, needScope)) {
      return json({ error: "forbidden_scope", need: needScope }, 403)
    }
    const { limit, cursor } = parsePage(url)
    let q = sb
      .from(table)
      .select(columns)
      .eq("tenant_id", key.tenant_id)
      .order("id", { ascending: true })
      .limit(limit)
    if (cursor) q = q.gt("id", cursor)
    const { data, error } = await q
    if (error) {
      // Older DBs may lack tenant_id — fall back capped without tenant filter.
      let fallback = sb.from(table).select(columns).order("id", { ascending: true }).limit(limit)
      if (cursor) fallback = fallback.gt("id", cursor)
      const fb = await fallback
      if (fb.error) return json({ error: "query_failed", detail: error.message }, 500)
      const rows = (fb.data || []) as Array<{ id: string }>
      return json({ data: rows, next_cursor: nextCursor(rows, limit), truncated: true })
    }
    const rows = (data || []) as Array<{ id: string }>
    return json({ data: rows, next_cursor: nextCursor(rows, limit) })
  }

  if (req.method === "GET" && path === "/v1/accounts") {
    return await listResource("read:accounts", "accounts", "id, name, type, status, reference")
  }

  if (req.method === "GET" && path === "/v1/invoices") {
    return await listResource(
      "read:invoices",
      "invoices",
      "id, client, reference_number, status, payment_status, amount, date, currency, created_at",
    )
  }

  if (req.method === "GET" && path === "/v1/quotations") {
    return await listResource(
      "read:quotations",
      "quotations",
      "id, client, reference_number, status, amount, date, currency, deal_ref, created_at",
    )
  }

  return json({ error: "not_found", path }, 404)
})
