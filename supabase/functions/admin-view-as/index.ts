// Admin "View as user": hands an admin a one time sign in token for a team
// member, after the database has checked the request (migration
// 20261335090000_admin_view_as.sql). No email is sent and no password is used.
//
// Flow: the app calls rpc rr_view_as_request (admin, two step done) and gets a
// request id, then POSTs { id } here with the admin's own sign in token. This
// function checks the caller, asks rr_view_as_issue (service role) whether the
// request is theirs, fresh and unused, and returns a magic link token hash the
// browser exchanges for a session as that member.
//
// Deploy: Actions, "Deploy Edge Functions" (admin-view-as).
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { serviceRoleKey } from "../_shared/supabaseKeys.ts"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS")
  if (!raw) return DEFAULT_ORIGINS
  return raw.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean)
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || ""
  const allowed = allowedOrigins()
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  })
}

/** The claims of a token Supabase has already checked (getUser). */
export function tokenClaims(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1] || ""
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")
    return JSON.parse(atob(b64)) as Record<string, unknown>
  } catch {
    return {}
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(withErrorLog("admin-view-as", async (req: Request) => {
  const cors = corsHeadersFor(req)
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json(405, { error: "POST only" }, cors)

  try {
    const url = Deno.env.get("SUPABASE_URL")
    const key = serviceRoleKey()
    if (!url || !key) throw new Error("Function is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
    if (!jwt) throw new HttpError(401, "Sign in first")
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt)
    const email = who?.user?.email?.toLowerCase()
    if (whoErr || !email) throw new HttpError(401, "Sign in first")
    if (tokenClaims(jwt).aal !== "aal2") throw new HttpError(403, "Finish two step sign in on your own account first")

    const body = (await req.json().catch(() => ({}))) as { id?: string }
    const id = String(body.id || "")
    if (!UUID.test(id)) throw new HttpError(400, "Missing View as request")

    // The database checks the request is this admin's, fresh (2 minutes) and unused.
    const { data: target, error: issueErr } = await admin.rpc("rr_view_as_issue", { p_id: id, p_admin_email: email })
    if (issueErr || typeof target !== "string" || !target) {
      throw new HttpError(403, issueErr?.message || "That View as request is not valid")
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: target })
    const tokenHash = link?.properties?.hashed_token
    if (linkErr || !tokenHash) throw new HttpError(500, linkErr?.message || "Could not start View as")

    return json(200, { token_hash: tokenHash, email: target }, cors)
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message }, cors)
    return json(500, { error: e instanceof Error ? e.message : "Server error" }, cors)
  }
}))
