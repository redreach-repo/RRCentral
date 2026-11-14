// Event outbox worker: claim pending domain events, run domain handlers
// (HubSpot nudge, digest signal, optional webhook), retry with backoff, DLQ.
//
// Pure classification lives in app/src/lib/eventOutboxWorker.ts (mirrored below).
//
// Called two ways:
//  * Schedule: header x-cron-secret = OUTBOX_CRON_SECRET (every few minutes).
//  * Signed-in manager or admin JWT: run by hand from System check / scripts.
// Deploy: Actions > Deploy Edge Functions (verify_jwt = false). Steps: docs/event-outbox.md.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"

const OUTBOX_MAX_ATTEMPTS = 8
const OUTBOX_BACKOFF_CAP_MS = 60 * 60 * 1000
const DEFAULT_BATCH = 25

type OutboxRow = {
  id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  payload: Record<string, unknown> | null
  attempts: number
  status: string
}

type DispatchResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string; retryable?: boolean }

type HandlerEffect = "hubspot_nudge" | "digest_signal" | "webhook_emit"

const HUBSPOT_EVENT_TYPES = new Set([
  "create_crm",
  "update_crm",
  "call_crm",
  "call_logged",
  "snooze_followup",
  "clear_followup",
  "save_wanders_deal",
  "create",
  "finalize_quote",
  "revise_quote",
  "convert_invoice",
  "mark_paid",
  "save_invoice",
])

const HUBSPOT_AGGREGATES = new Set([
  "crm",
  "sales_deal",
  "account",
  "quotation",
  "invoice",
])

const DIGEST_EVENT_TYPES = new Set([
  "finalize_quote",
  "mark_paid",
  "pay_link",
  "convert_invoice",
  "snooze_followup",
  "clear_followup",
  "call_crm",
  "call_logged",
  "update_delivery_note",
])

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function corsHeadersFor(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  const allowed = raw
    ? raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean)
    : DEFAULT_ORIGINS
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

function nextAvailableAt(attempts: number, now = new Date()): Date {
  const n = Math.max(1, Math.floor(attempts))
  const ms = Math.min(OUTBOX_BACKOFF_CAP_MS, 60_000 * 2 ** (n - 1))
  return new Date(now.getTime() + ms)
}

function planDomainHandlers(row: OutboxRow): { effects: HandlerEffect[]; detail: string } {
  const type = (row.event_type || "").trim()
  const aggregate = (row.aggregate_type || "").trim()
  if (!type) return { effects: [], detail: "blank event_type" }
  if (type === "__fail_test__" || type === "__poison_test__") {
    return { effects: [], detail: type }
  }
  const effects: HandlerEffect[] = []
  const hubspot =
    HUBSPOT_EVENT_TYPES.has(type) ||
    (HUBSPOT_AGGREGATES.has(aggregate) &&
      /^(create|update|save|finalize|mark_|convert_)/.test(type))
  if (hubspot) effects.push("hubspot_nudge")
  if (DIGEST_EVENT_TYPES.has(type)) effects.push("digest_signal")
  effects.push("webhook_emit")
  return { effects, detail: `${type} → ${effects.join("+") || "ack"}` }
}

function dispatchDomainEvent(row: OutboxRow): DispatchResult {
  const type = (row.event_type || "").trim()
  if (!type) return { ok: false, error: "blank event_type", retryable: false }
  switch (type) {
    case "__fail_test__":
      return { ok: false, error: "forced failure", retryable: true }
    case "__poison_test__":
      return { ok: false, error: "non-retryable poison", retryable: false }
    default: {
      const plan = planDomainHandlers(row)
      return { ok: true, detail: plan.detail }
    }
  }
}

function webhookPayload(row: OutboxRow, now = new Date()) {
  return {
    id: row.id,
    event_type: row.event_type,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    payload: row.payload || {},
    occurred_at: now.toISOString(),
    source: "rrcentral.event_outbox",
  }
}

async function upsertSetting(sb: SupabaseClient, key: string, value: string) {
  const { data: existing } = await sb.from("app_settings").select("key").eq("key", key).maybeSingle()
  if (existing) {
    const { error } = await sb.from("app_settings").update({ value }).eq("key", key)
    if (error) throw new Error(`settings update ${key}: ${error.message}`)
  } else {
    const { error } = await sb.from("app_settings").insert({ key, value })
    if (error) throw new Error(`settings insert ${key}: ${error.message}`)
  }
}

async function readSetting(sb: SupabaseClient, key: string): Promise<string> {
  const { data, error } = await sb.from("app_settings").select("value").eq("key", key).maybeSingle()
  if (error) throw new Error(`settings read ${key}: ${error.message}`)
  return typeof data?.value === "string" ? data.value : ""
}

async function markDone(sb: SupabaseClient, id: string) {
  const { error } = await sb
    .from("event_outbox")
    .update({
      status: "done",
      processed_at: new Date().toISOString(),
      last_error: "",
      available_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw new Error(`done ${id}: ${error.message}`)
}

async function markRetry(sb: SupabaseClient, id: string, attempts: number, err: string) {
  const when = nextAvailableAt(attempts)
  const { error } = await sb
    .from("event_outbox")
    .update({
      status: "pending",
      available_at: when.toISOString(),
      last_error: err.slice(0, 1000),
      processed_at: null,
    })
    .eq("id", id)
  if (error) throw new Error(`retry ${id}: ${error.message}`)
}

async function markFailed(sb: SupabaseClient, id: string, err: string) {
  const { error } = await sb
    .from("event_outbox")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      last_error: err.slice(0, 1000),
      available_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw new Error(`failed ${id}: ${error.message}`)
}

/** Run side effects for one row. HubSpot batch invoke is deferred. */
async function runEffects(
  sb: SupabaseClient,
  row: OutboxRow,
  effects: HandlerEffect[],
  webhookUrl: string,
  digestBuf: Array<Record<string, string>>,
  flags: { hubspot: boolean },
): Promise<DispatchResult> {
  try {
    for (const effect of effects) {
      if (effect === "hubspot_nudge") {
        flags.hubspot = true
      } else if (effect === "digest_signal") {
        digestBuf.push({
          event_type: row.event_type,
          aggregate_type: row.aggregate_type,
          aggregate_id: row.aggregate_id,
        })
      } else if (effect === "webhook_emit") {
        if (!webhookUrl) continue
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload(row)),
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          return {
            ok: false,
            error: `webhook ${res.status}: ${text.slice(0, 200) || res.statusText}`,
            retryable: true,
          }
        }
        await res.body?.cancel().catch(() => {})
      }
    }
    return { ok: true, detail: planDomainHandlers(row).detail }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    return { ok: false, error: err.message || "handler failed", retryable: true }
  }
}

Deno.serve(withErrorLog("event-outbox", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Who is calling: the schedule (shared secret) or a manager or admin.
  const cronSecret = Deno.env.get("OUTBOX_CRON_SECRET") || ""
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
    if (allowed !== true) return json({ error: "Only managers and admins can run the outbox worker" }, 403)
  }

  let batch = DEFAULT_BATCH
  try {
    const body = await req.json().catch(() => ({})) as { limit?: unknown }
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      batch = Math.max(1, Math.min(100, Math.floor(body.limit)))
    }
  } catch {
    // empty body is fine
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: claimed, error: claimError } = await sb.rpc("rr_claim_event_outbox", {
    p_limit: batch,
  })
  if (claimError) {
    return json({ error: `claim failed: ${claimError.message}` }, 500)
  }

  const rows = (claimed || []) as OutboxRow[]
  let done = 0
  let retried = 0
  let failed = 0
  let hubspotNudged = false
  let hubspotInvoked = false
  let digestEvents = 0
  let webhooksSent = 0

  const webhookUrl = (await readSetting(sb, "outbound_webhook_url").catch(() => "")).trim()
  const digestBuf: Array<Record<string, string>> = []
  const flags = { hubspot: false }

  for (const row of rows) {
    const classify = dispatchDomainEvent(row)
    if (!classify.ok) {
      if (classify.retryable === false || row.attempts >= OUTBOX_MAX_ATTEMPTS) {
        await markFailed(sb, row.id, classify.error)
        failed++
      } else {
        await markRetry(sb, row.id, row.attempts, classify.error)
        retried++
      }
      continue
    }

    const plan = planDomainHandlers(row)
    const beforeDigest = digestBuf.length
    const result = await runEffects(sb, row, plan.effects, webhookUrl, digestBuf, flags)
    if (webhookUrl && plan.effects.includes("webhook_emit") && result.ok) webhooksSent++
    digestEvents += digestBuf.length - beforeDigest

    if (result.ok) {
      await markDone(sb, row.id)
      done++
    } else if (result.retryable === false || row.attempts >= OUTBOX_MAX_ATTEMPTS) {
      await markFailed(sb, row.id, result.error)
      failed++
    } else {
      await markRetry(sb, row.id, row.attempts, result.error)
      retried++
    }
  }

  if (flags.hubspot) {
    const when = new Date().toISOString()
    await upsertSetting(sb, "hubspot_sync_requested_at", when)
    hubspotNudged = true
    const hubSecret = Deno.env.get("HUBSPOT_CRON_SECRET") || ""
    if (hubSecret) {
      try {
        const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/hubspot-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": hubSecret,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: "{}",
          signal: AbortSignal.timeout(20_000),
        })
        hubspotInvoked = res.ok
        await res.body?.cancel().catch(() => {})
      } catch {
        // Nudge is enough; nightly cron will pick up hubspot_sync_requested_at.
      }
    }
  }

  if (digestBuf.length) {
    const signal = {
      at: new Date().toISOString(),
      events: digestBuf.slice(0, 50),
    }
    await upsertSetting(sb, "digest_attention_signal", JSON.stringify(signal))
  }

  return json({
    claimed: rows.length,
    done,
    retried,
    failed,
    handlers: {
      hubspot_nudged: hubspotNudged,
      hubspot_invoked: hubspotInvoked,
      digest_events: digestEvents,
      webhooks_sent: webhooksSent,
      webhook_configured: Boolean(webhookUrl),
    },
  })
}, { secrets: ["OUTBOX_CRON_SECRET"] }))
