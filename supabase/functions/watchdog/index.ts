// Daily watchdog: each morning at 07:30 Dubai, check what has slipped and
// save it in watch_items, each with an owner, a reason and a link:
//   stale deals (CRM, AI CRM sales and CTRM, days set on Packages and rates),
//   invoices overdue 3, 7 and 14 days, tickets near or past their reply time,
//   clients over hours two months running, renewals within 30 days and
//   contracts past their end date.
// Rules live in app/src/lib/watchdog.ts (bundled), so the app and the
// function agree. The 08:00 daily digest lists the open stale deals and
// overdue invoices from this table.
//
// An item found again keeps its row (same key); an item not found any more
// gets cleared_at, so fixing the cause clears it on the next run.
//
// Called two ways:
//  * The daily schedule: header x-cron-secret = WATCHDOG_CRON_SECRET.
//  * A signed in manager or admin (their JWT), to run it by hand.
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).
// Steps: docs/watchdog.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { watchItems } from "./watchdog.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"

type WatchItem = { key: string }

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
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

/** Every row of a table (PostgREST returns at most 1000 at a time). */
// deno-lint-ignore no-explicit-any
async function selectAll(sb: SupabaseClient, table: string, columns: string, filter?: (q: any) => any) {
  const rows: unknown[] = []
  for (let from = 0; from < 50_000; from += 1000) {
    let q = sb.from(table).select(columns).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

/** Optional tables (their SQL may not have been run yet) read as empty. */
// deno-lint-ignore no-explicit-any
const maybe = (p: Promise<unknown[]>) => p.catch(() => [] as any[])

function monthStartTwoBack(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
  return d.toISOString().slice(0, 10)
}

Deno.serve(withErrorLog("watchdog", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Who is calling: the schedule (shared secret) or a manager or admin.
  const cronSecret = Deno.env.get("WATCHDOG_CRON_SECRET") || ""
  const providedSecret = req.headers.get("x-cron-secret") || ""
  if (providedSecret) {
    if (!cronSecret || providedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401)
  } else {
    const authHeader = req.headers.get("Authorization") || ""
    if (!authHeader) return json({ error: "Sign in to RR Central first" }, 401)
    const userDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: allowed } = await userDb.rpc("rr_is_manager_or_admin")
    if (allowed !== true) return json({ error: "Only managers and admins can run the watchdog" }, 403)
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const runStart = now.toISOString()

  const [settingRows, users, accounts, crm, salesDeals, ctrmDeals, invoices, payments, tickets, contracts, packages, entries] =
    await Promise.all([
      selectAll(sb, "app_settings", "key, value"),
      selectAll(sb, "app_users", "id, email, name", (q) => q.eq("active", true)),
      selectAll(sb, "accounts", "id, name, type, owner_user_id"),
      selectAll(sb, "crm", "id, company_name, owner, pipeline_stage, updated_at"),
      maybe(selectAll(sb, "sales_deals", "id, account_id, stage, owner_user_id, last_touch_at")),
      maybe(selectAll(sb, "ctrm_deals", "id, account_id, stage, owner_user_id, last_touch_at")),
      selectAll(sb, "invoices", "id, account_id, client, reference_number, date, payment_terms, status, payment_status, amount"),
      maybe(selectAll(sb, "payment_log", "invoice_ref, amount")),
      maybe(selectAll(sb, "tickets", "id, subject, account_id, status, assignee_user_id, created_at, sla_due_at, first_response_at", (q) =>
        q.in("status", ["new", "open", "waiting_on_client"]))),
      maybe(selectAll(sb, "contracts", "*")),
      maybe(selectAll(sb, "delivery_packages", "id, target_hours")),
      maybe(selectAll(sb, "time_entries", "account_id, date, hours", (q) => q.gte("date", monthStartTwoBack(now)))),
    ])

  const settings: Record<string, string> = {}
  for (const r of settingRows as { key: string; value: string }[]) settings[r.key] = String(r.value ?? "")
  const paid = new Map<string, number>()
  for (const p of payments as { invoice_ref: string; amount: number }[]) {
    paid.set(p.invoice_ref, (paid.get(p.invoice_ref) ?? 0) + (Number(p.amount) || 0))
  }

  const items = watchItems({
    now, settings, users, accounts, crm, salesDeals, ctrmDeals, invoices, paid, tickets, contracts, packages, entries,
  }) as WatchItem[]

  // Save what was found; first_seen_at stays on rows seen before.
  for (let i = 0; i < items.length; i += 500) {
    const batch = items.slice(i, i + 500).map((it) => ({ ...it, last_seen_at: runStart, cleared_at: null }))
    const { error } = await sb.from("watch_items").upsert(batch, { onConflict: "key" })
    if (error) throw new Error(`watch_items: ${error.message}`)
  }
  // Clear what was not found this time: its cause was fixed.
  const { data: cleared, error: clearError } = await sb
    .from("watch_items")
    .update({ cleared_at: runStart })
    .is("cleared_at", null)
    .lt("last_seen_at", runStart)
    .select("id")
  if (clearError) throw new Error(`watch_items: ${clearError.message}`)

  return json({ open: items.length, cleared: (cleared || []).length })
}, { secrets: ["WATCHDOG_CRON_SECRET"] }))
