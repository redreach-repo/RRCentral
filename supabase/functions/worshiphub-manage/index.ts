// Church review actions on WorshipHub for RR Central admins: accept, reject,
// verify or delete a church, the same as the WorshipHub App admin buttons.
//
// Calls POST on WorshipHub's RR Central endpoint (WORSHIPHUB_API_URL, the same
// URL and token worshiphub-read uses), so no new secrets are needed. Only
// active RR Central admins may call it, and every attempt is written to the
// audit log (table_name worshiphub_review) with who did it and the result.
// WorshipHub only deletes empty test or duplicate churches.
//
// Secrets: WORSHIPHUB_API_URL, WORSHIPHUB_API_TOKEN, optional WORSHIPHUB_API_KEY.
// Deploy: Actions > Deploy Edge Functions > worshiphub-manage (Verify JWT on).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

const ACTIONS = ["accept", "reject", "verify", "delete"] as const
type Action = (typeof ACTIONS)[number]

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

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const authHeader = req.headers.get("Authorization") || ""
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!authHeader || !supabaseUrl || !anonKey) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: isAdmin } = await userDb.rpc("rr_is_admin")
  if (isAdmin !== true) return json({ error: "Only RR Central admins can change churches on WorshipHub" }, 403)
  const { data: userData } = await userDb.auth.getUser()
  const actor = (userData.user?.email || "").toLowerCase()

  let input: { action?: string; slug?: string; name?: string }
  try {
    input = await req.json()
  } catch {
    return json({ error: "Invalid request" }, 400)
  }
  const action = input.action as Action
  const slug = String(input.slug || "").trim().toLowerCase()
  const name = String(input.name || "").trim().slice(0, 200)
  if (!ACTIONS.includes(action) || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return json({ error: "Pick an action and a church" }, 400)
  }

  const apiUrl = Deno.env.get("WORSHIPHUB_API_URL") || ""
  const token = Deno.env.get("WORSHIPHUB_API_TOKEN") || ""
  if (!apiUrl || !token) return json({ error: "The WorshipHub connection is not set up yet" }, 503)

  let status = 0
  let answer: Record<string, unknown> = {}
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    }
    const apiKey = Deno.env.get("WORSHIPHUB_API_KEY")
    if (apiKey) headers.apikey = apiKey
    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, slug, actor_email: actor }),
      signal: AbortSignal.timeout(15_000),
    })
    status = res.status
    answer = await res.json().catch(() => ({}))
  } catch {
    status = 0
  }
  const ok = status === 200 && answer.ok === true
  const message = ok
    ? ""
    : status === 0
      ? "WorshipHub did not answer"
      : status === 405
        ? "WorshipHub is not updated for this yet"
        : typeof answer.error === "string"
          ? answer.error.slice(0, 500)
          : `WorshipHub answered ${status}`

  // Log every attempt, done or refused. Written with the service key because
  // app users can only read the audit log.
  if (serviceKey) {
    const adminDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { error: logError } = await adminDb.from("audit_log").insert({
      table_name: "worshiphub_review",
      operation: action === "delete" ? "DELETE" : "UPDATE",
      row_id: slug,
      actor_email: actor || "unknown",
      changed_fields: [action],
      new_data: { action, slug, church: name, result: ok ? "done" : "refused", message, worshiphub_status: status },
    })
    if (logError) console.error("[worshiphub-manage] could not write the audit log", logError.message)
  }

  // Refusals answer 200 with ok false, so the app can show WorshipHub's reason.
  return ok ? json({ ok: true, action, slug }) : json({ ok: false, error: message })
})
