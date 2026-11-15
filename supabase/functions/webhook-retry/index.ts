/**
 * Background webhook retry worker (M11).
 * Drains webhook_endpoints where next_retry_at <= now and active.
 *
 * Auth: x-cron-secret === WEBHOOK_CRON_SECRET (falls back to OUTBOX_CRON_SECRET).
 * Deploy with verify_jwt = false.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
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

Deno.serve(withErrorLog("webhook-retry", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const cronSecret =
    Deno.env.get("WEBHOOK_CRON_SECRET") || Deno.env.get("OUTBOX_CRON_SECRET") || ""
  const providedSecret = req.headers.get("x-cron-secret") || ""
  if (!cronSecret || providedSecret !== cronSecret) {
    return json({ error: "forbidden" }, 403)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceKey) return json({ error: "server_misconfigured" }, 500)

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const nowIso = new Date().toISOString()

  const { data: due, error } = await sb
    .from("webhook_endpoints")
    .select("id, tenant_id, url, secret, delivery_failures, event_types")
    .eq("active", true)
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(25)

  if (error) return json({ error: "query_failed", detail: error.message }, 500)

  let delivered = 0
  let failed = 0

  for (const hook of due || []) {
    const eventType = "highmast.retry"
    const payload = {
      type: eventType,
      sent_at: nowIso,
      message: "HighMast webhook retry delivery",
      endpoint_id: hook.id,
    }
    const body = JSON.stringify(payload)
    const ts = Math.floor(Date.now() / 1000)
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
      const failures = ok ? 0 : Number(hook.delivery_failures || 0) + 1
      // Back off: 1m, 5m, 15m capped; clear schedule after many failures
      const backoffMin = failures === 0 ? 0 : Math.min(15, failures === 1 ? 1 : failures === 2 ? 5 : 15)
      await sb
        .from("webhook_endpoints")
        .update({
          last_delivery_at: new Date().toISOString(),
          last_delivery_status: `http_${res.status}`,
          delivery_failures: failures,
          next_retry_at:
            ok || failures >= 8 ? null : new Date(Date.now() + backoffMin * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", hook.id)
      await sb.from("webhook_delivery_attempts").insert({
        tenant_id: hook.tenant_id,
        endpoint_id: hook.id,
        event_type: eventType,
        attempt: failures === 0 ? 1 : failures,
        status: `http_${res.status}`,
      })
      if (ok) delivered++
      else failed++
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 80) : "error"
      const failures = Number(hook.delivery_failures || 0) + 1
      await sb
        .from("webhook_endpoints")
        .update({
          last_delivery_at: new Date().toISOString(),
          last_delivery_status: `error:${msg}`,
          delivery_failures: failures,
          next_retry_at: failures >= 8 ? null : new Date(Date.now() + 5 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", hook.id)
      failed++
    }
  }

  return json({
    ok: true,
    scanned: (due || []).length,
    delivered,
    failed,
  })
}, { secrets: ["WEBHOOK_CRON_SECRET|OUTBOX_CRON_SECRET"] }))
