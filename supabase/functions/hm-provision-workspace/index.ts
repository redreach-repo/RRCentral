/**
 * M11: idempotent workspace provision scaffold.
 * Auth: shared secret x-provision-secret === WORKSPACE_PROVISION_SECRET
 *   OR signed-in platform admin JWT (rr_is_admin) for internal retries.
 * Does not create auth users yet — records the request and links pack mapping.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { serviceRoleKey, publicApiKey } from "../_shared/supabaseKeys.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function corsHeadersFor(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  const allowed = raw ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : DEFAULT_ORIGINS
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-provision-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

Deno.serve(withErrorLog("hm-provision-workspace", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = serviceRoleKey() || ""
  const anonKey = publicApiKey() || ""
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Server misconfigured" }, 500)

  const provisionSecret = Deno.env.get("WORKSPACE_PROVISION_SECRET") || ""
  const providedSecret = req.headers.get("x-provision-secret") || ""
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()

  let authorized = Boolean(provisionSecret && providedSecret === provisionSecret)
  if (!authorized && jwt) {
    const userDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: who } = await userDb.auth.getUser(jwt)
    if (!who?.user) return json({ error: "Sign in first" }, 401)
    const { data: isAdmin } = await userDb.rpc("rr_is_admin")
    authorized = isAdmin === true
  }
  if (!authorized) return json({ error: "Forbidden" }, 403)

  const body = (await req.json().catch(() => ({}))) as {
    idempotency_key?: unknown
    workspace_name?: unknown
    admin_email?: unknown
    business_type?: unknown
  }
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : ""
  const workspaceName = typeof body.workspace_name === "string" ? body.workspace_name.trim() : ""
  const adminEmail = typeof body.admin_email === "string" ? body.admin_email.trim().toLowerCase() : ""
  const businessType = typeof body.business_type === "string" ? body.business_type.trim() : ""
  if (!idempotencyKey || !workspaceName || !adminEmail || !businessType) {
    return json({ error: "idempotency_key, workspace_name, admin_email, business_type required" }, 400)
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: existing } = await sb
    .from("workspace_provision_requests")
    .select("id, status, tenant_id, detail")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (existing) {
    return json({
      ok: true,
      idempotent: true,
      status: existing.status,
      tenant_id: existing.tenant_id,
      detail: existing.detail,
    })
  }

  const { data: map } = await sb
    .from("business_type_packs")
    .select("pack_key")
    .eq("business_type", businessType)
    .maybeSingle()
  if (!map?.pack_key) return json({ error: "unknown_business_type" }, 400)

  const { data: row, error } = await sb
    .from("workspace_provision_requests")
    .insert({
      idempotency_key: idempotencyKey,
      business_type: businessType,
      workspace_name: workspaceName,
      admin_email: adminEmail,
      status: "provisioned",
      detail: `Mapped to pack ${map.pack_key}. Auth user + tenant create still Alfred/ops.`,
      completed_at: new Date().toISOString(),
    })
    .select("id, status, detail")
    .single()

  if (error) return json({ error: error.message || "insert failed" }, 500)
  return json({
    ok: true,
    idempotent: false,
    status: row.status,
    pack_key: map.pack_key,
    detail: row.detail,
    request_id: row.id,
  })
}))
