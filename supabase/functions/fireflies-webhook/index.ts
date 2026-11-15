/**
 * M10: Fireflies webhook ingest.
 * Auth: shared secret header x-fireflies-secret === FIREFLIES_WEBHOOK_SECRET.
 * Matches meeting title/organizer to fireflies_webhook_maps and inserts account_activities.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fireflies-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

function normalize(raw: Record<string, unknown>) {
  const meetingId = String(raw.meetingId || raw.meeting_id || raw.id || "").trim()
  if (!meetingId) return null
  return {
    meetingId,
    title: String(raw.title || raw.meeting_title || "").trim(),
    organizerEmail: String(raw.organizerEmail || raw.organizer_email || raw.email || "")
      .trim()
      .toLowerCase(),
    summary: String(raw.summary || raw.overview || "").trim(),
    transcriptUrl: String(raw.transcriptUrl || raw.transcript_url || "").trim(),
    date: String(raw.date || raw.meeting_date || "").trim(),
  }
}

Deno.serve(withErrorLog("fireflies-webhook", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const expected = Deno.env.get("FIREFLIES_WEBHOOK_SECRET") || ""
  const provided = req.headers.get("x-fireflies-secret") || ""
  if (!expected || provided !== expected) return json({ error: "forbidden" }, 403)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!supabaseUrl || !serviceKey) return json({ error: "server_misconfigured" }, 500)
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const payload = normalize(raw)
  if (!payload) {
    await sb.from("fireflies_webhook_events").insert({
      payload: raw,
      status: "ignored",
      detail: "missing meeting id",
    })
    return json({ error: "meeting_id_required" }, 400)
  }

  const candidates = [payload.organizerEmail, payload.title.toLowerCase()].filter(Boolean)
  const { data: maps } = await sb
    .from("fireflies_webhook_maps")
    .select("id, tenant_id, match_key, account_id")
    .eq("active", true)
    .limit(500)

  const hit = (maps || []).find((m) => {
    const key = String(m.match_key || "").trim().toLowerCase()
    return key && candidates.some((c) => c.includes(key) || key.includes(c))
  })

  if (!hit) {
    await sb.from("fireflies_webhook_events").insert({
      external_id: payload.meetingId,
      payload: raw,
      status: "ignored",
      detail: "no map match",
    })
    return json({ ok: true, matched: false })
  }

  const body = [
    payload.title ? `Fireflies: ${payload.title}` : "Fireflies meeting",
    payload.date ? `When: ${payload.date}` : "",
    payload.summary ? `Summary: ${payload.summary}` : "",
    payload.transcriptUrl ? `Transcript: ${payload.transcriptUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const { error: actErr } = await sb.from("account_activities").insert({
    account_id: hit.account_id,
    kind: "meeting",
    body,
    external_source: "fireflies",
    external_id: payload.meetingId,
    user_email: "fireflies-webhook",
  })

  if (actErr) {
    const dup = String(actErr.code || "") === "23505"
    await sb.from("fireflies_webhook_events").insert({
      tenant_id: hit.tenant_id,
      external_id: payload.meetingId,
      payload: raw,
      status: dup ? "matched" : "error",
      detail: dup ? "already on timeline" : actErr.message || "insert failed",
    })
    if (dup) return json({ ok: true, matched: true, duplicate: true })
    return json({ error: "activity_insert_failed" }, 500)
  }

  await sb.from("fireflies_webhook_events").insert({
    tenant_id: hit.tenant_id,
    external_id: payload.meetingId,
    payload: raw,
    status: "matched",
    detail: `account ${hit.account_id}`,
  })

  return json({ ok: true, matched: true, account_id: hit.account_id })
}))
