// HubSpot sync: pushes RR Central accounts, account contacts and AI CRM deals
// to HubSpot as companies, contacts and deals. One way: nothing in HubSpot
// changes RR Central, and deleting a row here leaves the HubSpot record alone.
//
// Who can run it:
//  * A signed in manager or admin (Settings, HubSpot, Sync now).
//  * The nightly schedule: header x-cron-secret = HUBSPOT_CRON_SECRET.
// Verify JWT is off (supabase/config.toml) so the schedule can call it; the
// caller is checked here before anything else.
//
// Secrets: HUBSPOT_ACCESS_TOKEN (HubSpot private app), HUBSPOT_CRON_SECRET
// (for the schedule). Setup: docs/hubspot-sync.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { hubspotClient } from "../_shared/hubspot.ts"
import { type HubSpotLink, syncToHubSpot } from "../_shared/hubspotSync.ts"

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

/** Stop starting new rows after this long; the next run carries on. */
const TIME_BUDGET_MS = 100_000
/** A run that started this recently and has not finished is still going. */
const RUNNING_MINUTES = 5

async function all<T>(query: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query()
  if (error) throw new Error(error.message)
  return data || []
}

Deno.serve(withErrorLog("hubspot-sync", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Who is calling: the schedule (shared secret) or a manager or admin.
  let trigger: "manual" | "schedule" = "manual"
  let requestedBy = ""
  const cronSecret = Deno.env.get("HUBSPOT_CRON_SECRET") || ""
  const providedSecret = req.headers.get("x-cron-secret") || ""
  if (providedSecret) {
    if (!cronSecret || providedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401)
    trigger = "schedule"
    requestedBy = "schedule"
  } else {
    const authHeader = req.headers.get("Authorization") || ""
    if (!authHeader) return json({ error: "Sign in to RR Central first" }, 401)
    const userDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: allowed } = await userDb.rpc("rr_is_manager_or_admin")
    if (allowed !== true) return json({ error: "Only managers and admins can sync to HubSpot" }, 403)
    const { data: who } = await userDb.auth.getUser()
    requestedBy = who?.user?.email || ""
  }

  const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN") || ""
  if (!token) return json({ error: "HubSpot is not set up yet. Add HUBSPOT_ACCESS_TOKEN in Supabase (see docs/hubspot-sync.md)." }, 503)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const started = Date.now()

  const since = new Date(started - RUNNING_MINUTES * 60_000).toISOString()
  const { data: running } = await sb
    .from("hubspot_sync_runs")
    .select("id")
    .is("finished_at", null)
    .gte("started_at", since)
    .limit(1)
  if (running?.length) return json({ error: "A HubSpot sync is already running. Try again in a few minutes." }, 409)

  const { data: run, error: runError } = await sb
    .from("hubspot_sync_runs")
    .insert({ trigger, requested_by: requestedBy })
    .select("id")
    .single()
  if (runError || !run) return json({ error: `Could not start the sync: ${runError?.message || "no run row"}` }, 500)

  let message = ""
  let counts: Record<string, unknown> = {}
  try {
    const [accounts, contacts, deals, links] = await Promise.all([
      all(() => sb.from("accounts").select("id, type, name, reference, industry, country, city, website, status").order("created_at")),
      all(() => sb.from("account_contacts").select("id, account_id, name, role, email, phone, whatsapp").order("created_at")),
      all(() =>
        sb.from("sales_deals")
          .select("id, account_id, stage, monthly_fee, setup_fee, discount_percent, discount_months, quote_reference, next_action, next_action_date, signed_at, updated_at")
          .order("created_at")
      ),
      all(() => sb.from("hubspot_links").select("rr_table, rr_id, hubspot_type, hubspot_id, synced_hash")),
    ])

    const result = await syncToHubSpot(hubspotClient(token), { accounts, contacts, deals, links: links as HubSpotLink[] }, {
      deadline: started + TIME_BUDGET_MS,
      saveLink: async (link) => {
        const { error } = await sb
          .from("hubspot_links")
          .upsert({ ...link, synced_at: new Date().toISOString() }, { onConflict: "rr_table,rr_id" })
        if (error) throw new Error(`Could not save the HubSpot link: ${error.message}`)
      },
    })
    const { errors, ...rest } = result
    counts = rest
    message = [
      errors.join("\n"),
      result.more_to_do ? "Stopped early to stay within the time limit; the next sync carries on." : "",
    ].filter(Boolean).join("\n")
  } catch (e) {
    message = `The sync stopped: ${String((e as Error)?.message || e).slice(0, 500)}`
    counts = { failed: 1 }
  }

  await sb
    .from("hubspot_sync_runs")
    .update({ ...counts, message, finished_at: new Date().toISOString() })
    .eq("id", run.id)

  return json({ ok: true, ...counts, message })
}, { secrets: ["HUBSPOT_ACCESS_TOKEN", "HUBSPOT_CRON_SECRET"] }))
