// Event outbox worker: claim pending domain events, dispatch handlers, retry
// with backoff, and dead-letter after max attempts.
//
// Pure dispatch rules live in app/src/lib/eventOutboxWorker.ts (mirrored below
// so the Edge Function stays self-contained without a bundle step).
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

function dispatchDomainEvent(row: OutboxRow): DispatchResult {
  const type = (row.event_type || "").trim()
  if (!type) return { ok: false, error: "blank event_type", retryable: false }
  switch (type) {
    case "__fail_test__":
      return { ok: false, error: "forced failure", retryable: true }
    case "__poison_test__":
      return { ok: false, error: "non-retryable poison", retryable: false }
    default:
      return {
        ok: true,
        detail: `acked ${type} on ${row.aggregate_type || "aggregate"}`,
      }
  }
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
    // Migration not applied yet — fail clearly so System check / cron surface it.
    return json({ error: `claim failed: ${claimError.message}` }, 500)
  }

  const rows = (claimed || []) as OutboxRow[]
  let done = 0
  let retried = 0
  let failed = 0

  for (const row of rows) {
    const result = dispatchDomainEvent(row)
    if (result.ok) {
      await markDone(sb, row.id)
      done++
      continue
    }
    const retryable = result.retryable !== false
    if (!retryable || row.attempts >= OUTBOX_MAX_ATTEMPTS) {
      await markFailed(sb, row.id, result.error)
      failed++
    } else {
      await markRetry(sb, row.id, row.attempts, result.error)
      retried++
    }
  }

  return json({
    claimed: rows.length,
    done,
    retried,
    failed,
  })
}, { secrets: ["OUTBOX_CRON_SECRET"] }))
