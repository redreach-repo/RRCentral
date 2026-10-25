// Fireflies calls on the timeline: reads one meeting's summary and action
// items from Fireflies with the FIREFLIES_API_KEY secret, for a signed in
// team member who may write to the account. The app then keeps it on the
// account's timeline (as that person, so RLS decides). Manual for now: the
// team pastes the meeting's link or ID. Rules in app/src/lib/fireflies.ts (bundled).
//
//   POST { account_id, meeting }   meeting = a Fireflies link or meeting ID

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { FIREFLIES_GRAPHQL, parseFirefliesId, readTranscript, TRANSCRIPT_QUERY } from "./fireflies.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(withErrorLog("fireflies-fetch", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  if (!supabaseUrl || !anonKey) return json({ error: "Server misconfigured" }, 500)

  // Verify JWT is off for this function, so check the signed in user here, before anything else.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!jwt) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: who } = await userDb.auth.getUser(jwt)
  if (!who?.user) return json({ error: "Sign in to RR Central first" }, 401)

  const body = (await req.json().catch(() => ({}))) as { account_id?: unknown; meeting?: unknown }
  const accountId = typeof body.account_id === "string" && UUID.test(body.account_id) ? body.account_id : ""
  if (!accountId) return json({ error: "Open the account first" }, 400)
  const { data: allowed } = await userDb.rpc("rr_can_write_account", { target: accountId })
  if (allowed !== true) return json({ error: "You cannot add to this account's timeline" }, 403)

  const id = parseFirefliesId(typeof body.meeting === "string" ? body.meeting : "")
  if (!id) return json({ error: "Paste the meeting's Fireflies link or ID" }, 400)

  const apiKey = Deno.env.get("FIREFLIES_API_KEY") || ""
  if (!apiKey) return json({ error: "Fireflies is not set up yet. Add FIREFLIES_API_KEY in Supabase." }, 503)

  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: TRANSCRIPT_QUERY, variables: { id } }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null)
  if (!res) return json({ error: "Fireflies did not answer. Try again in a minute." }, 502)
  const out = (await res.json().catch(() => null)) as { data?: unknown; errors?: { message?: string }[] } | null
  if (res.status === 401 || res.status === 403) return json({ error: "Fireflies refused the API key. Check FIREFLIES_API_KEY." }, 502)
  const meeting = readTranscript(out?.data ?? null)
  if (!meeting) {
    const why = out?.errors?.[0]?.message || ""
    return json({ error: `That meeting was not found in Fireflies${why ? ` (${why.slice(0, 200)})` : ""}.` }, 404)
  }
  return json({ meeting })
}, { secrets: ["FIREFLIES_API_KEY"] }))
