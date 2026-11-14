// Sends signed webhook deliveries (gap plan module 2, docs/modules/public-api.md).
//
// Rows come from webhook_deliveries (filled by a trigger on event_outbox).
// Each POST carries HighMast-Signature (HMAC-SHA256 with the endpoint secret),
// HighMast-Event and HighMast-Delivery headers. Results and backoff are kept
// by rr_webhook_delivery_result(); after 8 failures a delivery is "dead".
//
// Called by the schedule (header x-cron-secret = WEBHOOK_CRON_SECRET) or by a
// signed in manager or admin. verify_jwt = false.
// Deploy: Actions > Deploy Edge Functions > Function: other, name hm-webhook-dispatch.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { deliveredOk, isAllowedTarget, signatureHeader } from "./lib.ts"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })

type Claimed = {
  id: string
  endpoint_id: string
  url: string
  secret: string
  event_type: string
  payload: unknown
  attempts: number
}

Deno.serve(withErrorLog("hm-webhook-dispatch", async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server misconfigured" }, 500)

  // Who is calling: the schedule (shared secret) or a manager or admin.
  const cronSecret = Deno.env.get("WEBHOOK_CRON_SECRET") || ""
  const providedSecret = req.headers.get("x-cron-secret") || ""
  if (providedSecret) {
    if (!cronSecret || providedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401)
  } else {
    const authHeader = req.headers.get("Authorization") || ""
    if (!authHeader) return json({ error: "Sign in first" }, 401)
    const userDb = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: allowed } = await userDb.rpc("rr_is_manager_or_admin")
    if (allowed !== true) return json({ error: "Only managers and admins can send webhooks" }, 403)
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await sb.rpc("rr_claim_webhook_deliveries", { p_limit: 25 })
  if (error) return json({ error: `claim failed: ${error.message}` }, 500)

  const counts = { succeeded: 0, failed: 0, dead: 0 }
  for (const d of (data || []) as Claimed[]) {
    const body = JSON.stringify(d.payload)
    let ok = false
    let status: number | null = null
    let err = ""
    try {
      if (!isAllowedTarget(d.url)) throw new Error("target not allowed (internal or non-https address)")
      const res = await fetch(d.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "HighMast-Webhooks/1",
          "HighMast-Event": d.event_type,
          "HighMast-Delivery": d.id,
          "HighMast-Signature": await signatureHeader(d.secret, body, Math.floor(Date.now() / 1000)),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      })
      status = res.status
      ok = deliveredOk(res.status)
      if (!ok) err = `HTTP ${res.status}`
      await res.body?.cancel()
    } catch (e) {
      err = e instanceof Error ? e.message : String(e)
    }
    const { data: outcome } = await sb.rpc("rr_webhook_delivery_result", {
      p_id: d.id, p_ok: ok, p_status_code: status, p_error: err,
    })
    if (outcome === "succeeded") counts.succeeded++
    else if (outcome === "dead") counts.dead++
    else counts.failed++
  }
  return json({ ok: true, claimed: (data || []).length, ...counts })
}, { secrets: ["SUPABASE_SERVICE_ROLE_KEY", "WEBHOOK_CRON_SECRET"] }))
