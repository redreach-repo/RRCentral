// Read only window into WorshipHub for the RR Central Products page.
//
// Calls WorshipHub's account level endpoint with a dedicated read only token
// and passes back only the fields in docs/worshiphub-integration.md, filtered
// by app/src/lib/worshiphub.ts (bundled). Nothing is stored in RR Central.
// A signed in RR Central user only gets the churches they can see; admins and
// managers also get tenants that have no church account yet, so they can add them.
//
// Secrets: WORSHIPHUB_API_URL, WORSHIPHUB_API_TOKEN, optional WORSHIPHUB_API_KEY.
// Deploy: npx supabase functions deploy worshiphub-read (Verify JWT on).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { sanitiseTenants } from "./worshiphub.bundle.js"
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

Deno.serve(withErrorLog("worshiphub-read", async (req) => {
  const cors = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  // Act as the signed in user so RLS decides which churches they may see.
  const authHeader = req.headers.get("Authorization") || ""
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
  if (!authHeader || !supabaseUrl || !anonKey) return json({ error: "Sign in to RR Central first" }, 401)
  const userDb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: member } = await userDb.rpc("rr_is_member")
  if (member !== true) return json({ error: "Your account does not have access to RR Central" }, 403)

  const apiUrl = Deno.env.get("WORSHIPHUB_API_URL") || ""
  const token = Deno.env.get("WORSHIPHUB_API_TOKEN") || ""
  if (!apiUrl || !token) return json({ connected: false, reason: "not_configured", tenants: [] })

  const { data: profiles, error: profileError } = await userDb
    .from("worship_church_profiles")
    .select("tenant_slug")
  if (profileError) return json({ error: "Could not read church accounts" }, 500)
  const visible = new Set((profiles || []).map((p: { tenant_slug: string }) => p.tenant_slug).filter(Boolean))
  const { data: seesAll } = await userDb.rpc("rr_is_manager_or_admin")

  let body: unknown
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" }
    const apiKey = Deno.env.get("WORSHIPHUB_API_KEY")
    if (apiKey) headers.apikey = apiKey
    const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      return json({ connected: false, reason: "unreachable", message: `WorshipHub answered ${res.status}`, tenants: [] })
    }
    body = await res.json()
  } catch {
    return json({ connected: false, reason: "unreachable", message: "WorshipHub did not answer", tenants: [] })
  }

  const tenants = sanitiseTenants(body).filter((t) => visible.has(t.slug) || seesAll === true)
  return json({ connected: true, fetched_at: new Date().toISOString(), tenants })
}, { secrets: ["WORSHIPHUB_API_URL", "WORSHIPHUB_API_TOKEN|WORSHIPHUB_API_KEY"] }))
