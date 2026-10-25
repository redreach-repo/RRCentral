// Client portal: an AI CRM client opens their private link and this function
// returns what they may see about their own account (tickets, build
// progress, usage against plan, the monthly report). The fields are chosen
// in app/src/lib/clientPortal.ts (bundled), never here.
//
// The client is not signed in. The link's token is hashed and looked up in
// portal_access with the service role; a revoked, expired or unknown link
// gets the same plain answer.
//
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  DELIVERY_RATE_KEYS,
  buildPortalView,
  hashPortalToken,
  isPortalToken,
  portalAccessState,
  ratesFromSettings,
} from "./clientPortal.bundle.js"

type PortalAccessRow = {
  id: string
  account_id: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
}

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const NOT_VALID = "This link does not work any more. Ask Red Reach for a new one."

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  const body = (await req.json().catch(() => ({}))) as { token?: unknown; month?: unknown }
  const token = typeof body.token === "string" ? body.token : ""
  const month = typeof body.month === "string" && /^\d{4}-\d{2}-01$/.test(body.month) ? body.month : null
  if (!isPortalToken(token)) return json({ error: NOT_VALID }, 404)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const { data: access } = await sb
    .from("portal_access")
    .select("id, account_id, expires_at, revoked_at, last_used_at")
    .eq("token_hash", await hashPortalToken(token))
    .maybeSingle()
  const row = access as PortalAccessRow | null
  if (!row || portalAccessState(row, now) !== "active") return json({ error: NOT_VALID }, 404)

  const accountId = row.account_id
  const { data: account } = await sb.from("accounts").select("name, reference, type").eq("id", accountId).maybeSingle()
  if (!account || (account as { type: string }).type !== "ai_crm_client") return json({ error: NOT_VALID }, 404)

  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 7, 1)).toISOString().slice(0, 10)
  const settingKeys = ["companyName", ...Object.values(DELIVERY_RATE_KEYS as Record<string, string>)]
  const [contracts, packages, stages, requirements, tickets, usage, entries, settings] = await Promise.all([
    sb.from("contracts").select("*").eq("account_id", accountId),
    sb.from("delivery_packages").select("*"),
    sb.from("build_stages").select("*").eq("account_id", accountId),
    sb.from("requirements").select("title, status, is_change_request").eq("account_id", accountId),
    sb
      .from("tickets")
      .select("subject, status, created_at, sla_due_at, first_response_at, resolved_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("usage_records").select("*").eq("account_id", accountId),
    sb.from("time_entries").select("date, hours, category").eq("account_id", accountId).gte("date", since),
    sb.from("app_settings").select("key, value").in("key", settingKeys),
  ])
  const failed = [contracts, packages, stages, requirements, tickets, usage, entries].find((r) => r.error)
  if (failed?.error) return json({ error: "The portal could not load. Please try again later." }, 500)

  const settingMap: Record<string, string> = {}
  for (const s of (settings.data || []) as { key: string; value: string }[]) settingMap[s.key] = s.value

  // Note the visit, at most once an hour.
  if (!row.last_used_at || now.getTime() - Date.parse(row.last_used_at) > 3_600_000) {
    await sb.from("portal_access").update({ last_used_at: now.toISOString() }).eq("id", row.id)
  }

  const view = buildPortalView({
    now,
    month,
    companyName: settingMap.companyName || "Red Reach Middle East FZE",
    account: account as { name: string; reference: string },
    contracts: contracts.data || [],
    packages: packages.data || [],
    stages: stages.data || [],
    requirements: requirements.data || [],
    tickets: tickets.data || [],
    usage: usage.data || [],
    entries: entries.data || [],
    rates: ratesFromSettings(settingMap),
  })
  return json(view)
})
