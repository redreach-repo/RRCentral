// HighMast public REST API, read only (v1). Gap plan module 2, docs/modules/public-api.md.
//
// Auth: "Authorization: Bearer hm_..." API key made by an admin in the app.
// Only the SHA-256 hash is stored; the key's tenant scopes every query, and
// the key's scopes decide which resources it may read.
//
//   GET /functions/v1/hm-public-api/v1                → index
//   GET /functions/v1/hm-public-api/v1/accounts       → list (?limit=1..200&cursor=...)
//   GET /functions/v1/hm-public-api/v1/accounts/<id>  → one
//   same for invoices, quotations
//
// verify_jwt = false (callers have API keys, not Supabase sign ins).
// Deploy: Actions > Deploy Edge Functions > Function: other, name hm-public-api.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import {
  afterCursorFilter,
  bearerKey,
  clampLimit,
  decodeCursor,
  hasScope,
  keyProblem,
  pageOf,
  parseRoute,
  RESOURCES,
  sha256Hex,
  type KeyRow,
} from "./lib.ts"

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
const problem = (status: number, code: string, message: string) => json({ error: { code, message } }, status)

Deno.serve(withErrorLog("hm-public-api", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })
  if (req.method !== "GET") return problem(405, "method_not_allowed", "v1 is read only")

  const key = bearerKey(req.headers.get("authorization"))
  if (!key) return problem(401, "missing_api_key", "Send Authorization: Bearer hm_...")

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceKey) return problem(503, "not_configured", "API not set up")
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: keyRow, error: keyError } = await sb
    .from("api_keys")
    .select("id, tenant_id, scopes, revoked_at, expires_at, last_used_at")
    .eq("key_hash", await sha256Hex(key))
    .maybeSingle()
  if (keyError) return problem(503, "unavailable", "Try again later")
  const why = keyProblem(keyRow as KeyRow | null)
  if (why) return problem(401, why, "This API key cannot be used")
  const apiKey = keyRow as KeyRow & { last_used_at: string | null }

  const url = new URL(req.url)
  const route = parseRoute(url.pathname)
  if (!route) return problem(404, "not_found", "Unknown path")

  // Note use at most once a minute (keeps writes low).
  const lastUsed = apiKey.last_used_at ? Date.parse(apiKey.last_used_at) : 0
  if (Date.now() - lastUsed > 60_000) {
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id)
  }

  if (route.kind === "root") {
    return json({
      version: "v1",
      resources: Object.keys(RESOURCES).filter((r) => hasScope(apiKey.scopes, r)),
    })
  }

  if (!hasScope(apiKey.scopes, route.resource)) {
    return problem(403, "insufficient_scope", `This key needs ${RESOURCES[route.resource].scope}`)
  }
  const res = RESOURCES[route.resource]
  const select = res.fields.join(",")

  if (route.kind === "get") {
    const { data, error } = await sb.from(res.table).select(select)
      .eq("tenant_id", apiKey.tenant_id).eq("id", route.id).maybeSingle()
    if (error) return problem(503, "unavailable", "Try again later")
    if (!data) return problem(404, "not_found", "No such record")
    return json({ data })
  }

  const limit = clampLimit(url.searchParams.get("limit"))
  const rawCursor = url.searchParams.get("cursor")
  const cursor = decodeCursor(rawCursor)
  if (rawCursor && !cursor) return problem(400, "bad_cursor", "Use next_cursor from the previous page")
  let q = sb.from(res.table).select(select).eq("tenant_id", apiKey.tenant_id)
  if (cursor) q = q.or(afterCursorFilter(cursor))
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)
  if (error) return problem(503, "unavailable", "Try again later")
  return json(pageOf((data || []) as unknown as { created_at: string; id: string }[], limit))
}, { secrets: ["SUPABASE_SERVICE_ROLE_KEY"] }))
