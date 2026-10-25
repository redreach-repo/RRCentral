// Contract invoices: each morning at 06:00 Dubai, raise the setup and
// monthly invoices that AI CRM contracts have come due for, as drafts on
// Invoices (division 03 RR Marketing and Net 7 days unless changed on
// Packages and rates). A person still finalises each draft to get its RR
// number. Rules live in app/src/lib/contractBillingRun.ts (bundled), the same
// code the app uses, so nobody has to open the app for drafts to appear.
//
// Running it twice raises nothing more: each contract, kind and month is
// claimed once in contract_invoices (unique key contract_id, kind, period).
//
// Called two ways:
//  * The daily schedule: header x-cron-secret = CONTRACT_BILLING_CRON_SECRET.
//  * A signed in manager or admin (their JWT), to run it by hand.
//
// After each run it saves the time in app_settings (contractBillingLastRun);
// the app only raises invoices itself when that is more than 36 hours old.
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).
// Steps: docs/contract-invoices.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { BILLING_LAST_RUN_KEY, billingSettings, ratesFromSettings, runBilling } from "./contractBillingRun.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"

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

/** Now, shifted so that its UTC date and month are Dubai's (UTC+4, no daylight saving). */
function dubaiToday(): Date {
  return new Date(Date.now() + 4 * 60 * 60 * 1000)
}

const RUN_BY = "RR Central daily run"

// deno-lint-ignore no-explicit-any
function serverBillingDb(sb: SupabaseClient): any {
  const must = (label: string) => ({ error }: { error: { message: string } | null }) => {
    if (error) throw new Error(`${label}: ${error.message}`)
  }
  return {
    newId: () => crypto.randomUUID(),
    async claim(row: Record<string, unknown>) {
      const { error } = await sb.from("contract_invoices").insert(row)
      if (!error) return true
      if (error.code === "23505") return false
      throw new Error(`contract_invoices: ${error.message}`)
    },
    async releaseClaim(id: string) {
      await sb.from("contract_invoices").delete().eq("id", id)
    },
    async insertInvoice(row: Record<string, unknown>) {
      must("invoices")(await sb.from("invoices").insert(row))
    },
    async replaceLines(reference: string, rows: Record<string, unknown>[]) {
      must("line_items")(await sb.from("line_items").delete().eq("doc_type", "Invoice").eq("reference", reference))
      if (rows.length) must("line_items")(await sb.from("line_items").insert(rows))
    },
    async linkClaim(claimId: string, invoiceId: string) {
      must("contract_invoices")(await sb.from("contract_invoices").update({ invoice_id: invoiceId }).eq("id", claimId))
    },
    async setClaimAmount(claimId: string, amount: number) {
      must("contract_invoices")(await sb.from("contract_invoices").update({ generated_amount: amount }).eq("id", claimId))
    },
    async setDiscountMonthsLeft(contractId: string, left: number) {
      must("contracts")(
        await sb.from("contracts").update({ discount_months_left: left, updated_at: new Date().toISOString() }).eq("id", contractId),
      )
    },
    async getInvoice(id: string) {
      const { data } = await sb.from("invoices").select("*").eq("id", id).maybeSingle()
      return data ?? null
    },
    async updateInvoice(id: string, fields: Record<string, unknown>) {
      must("invoices")(await sb.from("invoices").update(fields).eq("id", id))
    },
    async logEvent(accountId: string, body: string) {
      await sb.from("account_activities").insert({
        id: crypto.randomUUID(),
        account_id: accountId,
        user_id: null,
        user_email: RUN_BY,
        kind: "system",
        body,
        created_at: new Date().toISOString(),
      })
    },
  }
}

Deno.serve(withErrorLog("contract-invoices", async (req) => {
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
  const cronSecret = Deno.env.get("CONTRACT_BILLING_CRON_SECRET") || ""
  const providedSecret = req.headers.get("x-cron-secret") || ""
  let runBy = RUN_BY
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
    if (allowed !== true) return json({ error: "Only managers and admins can run contract invoicing" }, 403)
    const { data: who } = await userDb.auth.getUser()
    runBy = who?.user?.email || RUN_BY
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const settingRows = (await selectAll(sb, "app_settings", "key, value")) as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  for (const r of settingRows) settings[r.key] = String(r.value ?? "")

  const contracts = await selectAll(sb, "contracts", "*", (q) => q.eq("auto_invoice", true))
  const accountIds = [...new Set((contracts as { account_id: string }[]).map((c) => c.account_id))]
  const [packages, accounts, usage, existing] = accountIds.length
    ? await Promise.all([
      selectAll(sb, "delivery_packages", "*"),
      selectAll(sb, "accounts", "id, name", (q) => q.in("id", accountIds)),
      selectAll(sb, "usage_records", "*", (q) => q.in("account_id", accountIds)).catch(() => []),
      selectAll(sb, "contract_invoices", "*"),
    ])
    : [[], [], [], []]

  const result = await runBilling({
    data: { contracts, packages, accounts, usage, existing },
    dbx: serverBillingDb(sb),
    cfg: billingSettings(settings),
    rates: ratesFromSettings(settings),
    authorEmail: runBy,
    today: dubaiToday(),
  }) as { raised: number; refreshed: number; drafted: { accountName: string; description: string; total: number }[] }

  await sb.from("app_settings").upsert({ key: BILLING_LAST_RUN_KEY, value: new Date().toISOString() }, { onConflict: "key" })

  return json({
    raised: result.raised,
    refreshed: result.refreshed,
    contracts: contracts.length,
    drafted: result.drafted.map((d) => `${d.accountName}: ${d.description}, ${d.total.toFixed(2)} AED`),
  })
}, { secrets: ["CONTRACT_BILLING_CRON_SECRET"] }))
