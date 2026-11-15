/**
 * Public API (M11 writes slice).
 * GET  /public-api                 → health
 * GET  /public-api/v1/me           → key metadata (x-api-key)
 * GET  /public-api/v1/accounts     → list (read:accounts)
 * POST /public-api/v1/accounts     → create (write:accounts)
 * PATCH /public-api/v1/accounts/:id → update (write:accounts)
 * GET  /public-api/v1/invoices     → list (read:invoices)
 * GET  /public-api/v1/quotations   → list (read:quotations)
 *
 * List routes support ?limit=1..100&cursor=<last-id>.
 * Deploy with verify_jwt = false; auth is via hashed api_keys (x-api-key).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
}

const ACCOUNT_TYPES = new Set(["ai_crm_client", "worship_church", "ctrm_prospect"])
const ACCOUNT_COLUMNS = "id, name, type, status, reference, industry, country, city, website, source, notes, created_at, updated_at"

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

function trimStr(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max)
}

function parseAccountWrite(
  raw: unknown,
  partial: boolean,
): { ok: true; patch: Record<string, string> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body_must_be_object" }
  }
  const body = raw as Record<string, unknown>
  const patch: Record<string, string> = {}

  if (body.name !== undefined || !partial) {
    const name = trimStr(body.name, 200)
    if (!name) return { ok: false, error: "name_required" }
    patch.name = name
  }
  if (body.type !== undefined || !partial) {
    const type = trimStr(body.type || "ai_crm_client", 40)
    if (!ACCOUNT_TYPES.has(type)) return { ok: false, error: "invalid_type" }
    patch.type = type
  }
  if (body.reference !== undefined) patch.reference = trimStr(body.reference, 80)
  if (body.status !== undefined) patch.status = trimStr(body.status, 40) || "active"
  if (body.industry !== undefined) patch.industry = trimStr(body.industry, 120)
  if (body.country !== undefined) patch.country = trimStr(body.country, 80)
  if (body.city !== undefined) patch.city = trimStr(body.city, 80)
  if (body.website !== undefined) patch.website = trimStr(body.website, 200)
  if (body.notes !== undefined) patch.notes = trimStr(body.notes, 2000)
  if (body.source !== undefined) patch.source = trimStr(body.source, 80)

  if (partial && Object.keys(patch).length === 0) return { ok: false, error: "empty_patch" }
  return { ok: true, patch }
}

async function signWebhookBody(secret: string, body: string, timestampSec: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestampSec}.${body}`))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Best-effort fan-out to active tenant webhooks (does not block the API response path long). */
async function emitAccountWebhook(
  sb: SupabaseClient,
  tenantId: string,
  eventType: string,
  account: Record<string, unknown>,
) {
  const { data: hooks } = await sb
    .from("webhook_endpoints")
    .select("id, url, secret, active, event_types, delivery_failures")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .limit(20)
  if (!hooks?.length) return

  const payload = {
    type: eventType,
    sent_at: new Date().toISOString(),
    data: account,
  }
  const body = JSON.stringify(payload)
  const ts = Math.floor(Date.now() / 1000)

  for (const hook of hooks) {
    const types = Array.isArray(hook.event_types) ? hook.event_types.map(String) : ["*"]
    if (!types.includes("*") && !types.includes(eventType)) continue
    try {
      const digest = await signWebhookBody(String(hook.secret || ""), body, ts)
      const res = await fetch(String(hook.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-HighMast-Event": eventType,
          "X-HighMast-Timestamp": String(ts),
          "X-HighMast-Signature": `t=${ts},v1=${digest}`,
        },
        body,
      })
      const ok = res.ok
      await sb
        .from("webhook_endpoints")
        .update({
          last_delivery_at: new Date().toISOString(),
          last_delivery_status: `http_${res.status}`,
          delivery_failures: ok ? 0 : Number(hook.delivery_failures || 0) + 1,
          next_retry_at: ok ? null : new Date(Date.now() + 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", hook.id)
      await sb.from("webhook_delivery_attempts").insert({
        tenant_id: tenantId,
        endpoint_id: hook.id,
        event_type: eventType,
        attempt: 1,
        status: `http_${res.status}`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 80) : "error"
      await sb
        .from("webhook_endpoints")
        .update({
          last_delivery_at: new Date().toISOString(),
          last_delivery_status: `error:${msg}`,
          delivery_failures: Number(hook.delivery_failures || 0) + 1,
          next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", hook.id)
    }
  }
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
      version: "0.4.0",
      routes: [
        "GET /",
        "GET /v1/me",
        "GET /v1/accounts",
        "POST /v1/accounts",
        "PATCH /v1/accounts/:id",
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

  if (req.method === "POST" && path === "/v1/accounts") {
    if (!hasScope(scopes, "write:accounts")) {
      return json({ error: "forbidden_scope", need: "write:accounts" }, 403)
    }
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return json({ error: "invalid_json" }, 400)
    }
    const parsed = parseAccountWrite(raw, false)
    if (!parsed.ok) return json({ error: parsed.error }, 400)
    const row = {
      ...parsed.patch,
      tenant_id: key.tenant_id,
      status: parsed.patch.status || "active",
      created_by: `api_key:${key.key_prefix}`,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await sb.from("accounts").insert(row).select(ACCOUNT_COLUMNS).single()
    if (error) return json({ error: "insert_failed", detail: error.message }, 500)
    const account = data as Record<string, unknown>
    try {
      await emitAccountWebhook(sb, key.tenant_id, "account.created", account)
    } catch {
      /* partner notify best-effort */
    }
    return json({ data: account }, 201)
  }

  const patchMatch = path.match(/^\/v1\/accounts\/([0-9a-f-]{36})$/i)
  if (req.method === "PATCH" && patchMatch) {
    if (!hasScope(scopes, "write:accounts")) {
      return json({ error: "forbidden_scope", need: "write:accounts" }, 403)
    }
    const accountId = patchMatch[1]
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return json({ error: "invalid_json" }, 400)
    }
    const parsed = parseAccountWrite(raw, true)
    if (!parsed.ok) return json({ error: parsed.error }, 400)
    const { data, error } = await sb
      .from("accounts")
      .update({ ...parsed.patch, updated_at: new Date().toISOString() })
      .eq("id", accountId)
      .eq("tenant_id", key.tenant_id)
      .select(ACCOUNT_COLUMNS)
      .maybeSingle()
    if (error) return json({ error: "update_failed", detail: error.message }, 500)
    if (!data) return json({ error: "not_found" }, 404)
    const account = data as Record<string, unknown>
    try {
      await emitAccountWebhook(sb, key.tenant_id, "account.updated", account)
    } catch {
      /* partner notify best-effort */
    }
    return json({ data: account })
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
