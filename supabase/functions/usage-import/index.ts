// Daily usage import for AI CRM clients: WhatsApp message counts from Meta
// and AI spend from the Anthropic Admin API, written to usage_records per
// client and month. Rules live in app/src/lib/usageImport.ts (bundled).
//
// Called two ways:
//  * "Import now" in the app: a signed in manager or admin (their JWT).
//  * The daily schedule: header x-cron-secret = USAGE_IMPORT_CRON_SECRET.
//
// Secrets (each source is skipped while its secrets are missing):
//   META_WABA_ID, META_ACCESS_TOKEN, optional META_GRAPH_VERSION (default v21.0)
//   ANTHROPIC_ADMIN_KEY
//   USAGE_IMPORT_CRON_SECRET (for the schedule)
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false in supabase/config.toml).
// (the function checks the caller itself, so the schedule can call it).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  monthWindow,
  monthsToImport,
  parseAnthropicCost,
  parseWhatsAppAnalytics,
  planUsageUpdates,
} from "./usageImport.bundle.js"

// Shapes from app/src/lib/usageImport.ts (the bundle is plain JS).
type WhatsAppCounts = { marketing: number; service: number }
type UsageSource = { account_id: string; whatsapp_phones: string[]; ai_workspace_id: string }
type ExistingUsage = { id: string; account_id: string; month: string; updated_at: string | null; imported_at: string | null }
type UsageUpdate = { account_id: string; month: string; id: string | null; fields: Record<string, unknown> }

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

type SourceStatus = "ok" | "not_configured" | "error"

async function fetchWhatsApp(month: string, now: Date): Promise<Map<string, WhatsAppCounts>> {
  const waba = Deno.env.get("META_WABA_ID") || ""
  const token = Deno.env.get("META_ACCESS_TOKEN") || ""
  const version = Deno.env.get("META_GRAPH_VERSION") || "v21.0"
  const { start, end } = monthWindow(month, now)
  const s = Math.floor(start.getTime() / 1000)
  const e = Math.floor(end.getTime() / 1000)
  const field =
    `pricing_analytics.start(${s}).end(${e}).granularity(DAILY)` +
    `.dimensions(["PRICING_CATEGORY","PHONE"]).metric_types(["VOLUME"])`
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(waba)}?fields=${encodeURIComponent(field)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } }).error?.message || `Meta answered ${res.status}`
    throw new Error(msg)
  }
  return parseWhatsAppAnalytics(body)
}

async function fetchAnthropic(month: string, now: Date): Promise<Map<string, number>> {
  const key = Deno.env.get("ANTHROPIC_ADMIN_KEY") || ""
  const { start, end } = monthWindow(month, now)
  const pages: unknown[] = []
  let page: string | null = null
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({
      starting_at: start.toISOString(),
      ending_at: end.toISOString(),
      limit: "31",
    })
    params.append("group_by[]", "workspace_id")
    if (page) params.set("page", page)
    const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${params}`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(20_000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (body as { error?: { message?: string } }).error?.message || `Anthropic answered ${res.status}`
      throw new Error(msg)
    }
    pages.push(body)
    const next = body as { has_more?: boolean; next_page?: string | null }
    if (!next.has_more || !next.next_page) break
    page = next.next_page
  }
  return parseAnthropicCost(pages)
}

Deno.serve(async (req) => {
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
  let trigger: "manual" | "schedule" = "manual"
  let requestedBy = ""
  const cronSecret = Deno.env.get("USAGE_IMPORT_CRON_SECRET") || ""
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
    if (allowed !== true) return json({ error: "Only managers and admins can run the import" }, 403)
    const { data: who } = await userDb.auth.getUser()
    requestedBy = who?.user?.email || ""
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const now = new Date()
  const { data: run } = await sb
    .from("usage_import_runs")
    .insert({ trigger, requested_by: requestedBy })
    .select("id")
    .single()

  const hasMeta = Boolean(Deno.env.get("META_WABA_ID") && Deno.env.get("META_ACCESS_TOKEN"))
  const hasAi = Boolean(Deno.env.get("ANTHROPIC_ADMIN_KEY"))
  let whatsappStatus: SourceStatus = hasMeta ? "ok" : "not_configured"
  let aiStatus: SourceStatus = hasAi ? "ok" : "not_configured"
  const messages: string[] = []
  let written = 0
  const skippedIds = new Set<string>()

  const { data: sourceRows, error: sourceError } = await sb.from("usage_sources").select("*")
  if (sourceError) return json({ error: "Could not read usage sources. Has the usage import SQL been run?" }, 500)
  const sources = (sourceRows || []) as UsageSource[]

  for (const month of monthsToImport(now)) {
    let whatsapp: Map<string, WhatsAppCounts> | null = null
    let ai: Map<string, number> | null = null
    if (hasMeta && whatsappStatus !== "error") {
      try {
        whatsapp = await fetchWhatsApp(month, now)
      } catch (e) {
        whatsappStatus = "error"
        messages.push(`WhatsApp: ${(e as Error).message}`.slice(0, 300))
      }
    }
    if (hasAi && aiStatus !== "error") {
      try {
        ai = await fetchAnthropic(month, now)
      } catch (e) {
        aiStatus = "error"
        messages.push(`AI: ${(e as Error).message}`.slice(0, 300))
      }
    }
    if (!whatsapp && !ai) continue

    const { data: existing } = await sb
      .from("usage_records")
      .select("id, account_id, month, updated_at, imported_at")
      .eq("month", month)
    const plan = planUsageUpdates({
      month,
      sources,
      existing: (existing || []) as ExistingUsage[],
      whatsapp,
      ai,
    }) as unknown as { updates: UsageUpdate[]; skipped: string[] }
    plan.skipped.forEach((id: string) => skippedIds.add(id))
    const stamp = new Date().toISOString()
    for (const u of plan.updates) {
      const row = { ...u.fields, updated_at: stamp, imported_at: stamp }
      const result = u.id
        ? await sb.from("usage_records").update(row).eq("id", u.id)
        : await sb.from("usage_records").insert({ ...row, account_id: u.account_id, month: u.month })
      if (result.error) messages.push(`Could not save usage: ${result.error.message}`.slice(0, 300))
      else written++
    }
  }

  if (skippedIds.size) {
    messages.push(`${skippedIds.size} client month(s) were entered by hand, so the import left them alone.`)
  }
  if (run?.id) {
    await sb
      .from("usage_import_runs")
      .update({
        finished_at: new Date().toISOString(),
        whatsapp_status: whatsappStatus,
        ai_status: aiStatus,
        rows_written: written,
        message: messages.join(" ").slice(0, 1000),
      })
      .eq("id", run.id)
  }
  return json({
    whatsapp: whatsappStatus,
    ai: aiStatus,
    written,
    skipped: skippedIds.size,
    clientsLinked: sources.length,
    message: messages.join(" "),
  })
})
