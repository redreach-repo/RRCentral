// Admin-only: create or update a Supabase Auth user password for @redreach.ae staff.
// Deploy: supabase functions deploy manage-auth-user --project-ref pszjylxrpvlumldtptrr
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const DEFAULT_ORIGINS = [
  "https://redreach-repo.github.io",
  "https://redreach.ae",
  "https://www.redreach.ae",
  "http://localhost:5173",
  "http://localhost:4173",
]

const ALLOWED_DOMAIN = "redreach.ae"
const MIN_PASSWORD_LEN = 8

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
    headers: { "Content-Type": "application/json", ...cors },
  })
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) throw new Error("Function is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function normalizeEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase()
}

function assertAllowedEmail(email: string) {
  if (!email.includes("@") || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new HttpError(400, `Only @${ALLOWED_DOMAIN} emails are allowed`)
  }
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") || ""
  const jwt = auth.replace(/^Bearer\s+/i, "").trim()
  if (!jwt) throw new HttpError(401, "Sign in first")
  const admin = adminClient()
  const { data, error } = await admin.auth.getUser(jwt)
  const email = data?.user?.email?.toLowerCase()
  if (error || !email) throw new HttpError(401, "Sign in first")
  const { data: member } = await admin
    .from("app_users")
    .select("active, role")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle()
  if (!member?.active || member.role !== "admin") {
    throw new HttpError(403, "Only admins can set login passwords")
  }
  return admin
}

/** Find auth user id by email (paginated list — team is small). */
async function findAuthUserId(
  admin: ReturnType<typeof adminClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new HttpError(500, error.message)
    const hit = (data.users || []).find((u) => (u.email || "").toLowerCase() === target)
    if (hit) return hit.id
    if (!data.users?.length || data.users.length < 200) return null
    page += 1
    if (page > 20) return null
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors })
  }
  if (req.method !== "POST") {
    return json(405, { error: "POST only" }, cors)
  }

  try {
    const admin = await requireAdmin(req)
    const body = (await req.json()) as { email?: string; password?: string; name?: string }
    const email = normalizeEmail(body.email || "")
    const password = String(body.password || "")
    const name = String(body.name || "").trim()

    assertAllowedEmail(email)
    if (password.length < MIN_PASSWORD_LEN) {
      throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LEN} characters`)
    }

    const existingId = await findAuthUserId(admin, email)
    if (existingId) {
      const { error } = await admin.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
        user_metadata: name ? { name } : undefined,
      })
      if (error) throw new HttpError(400, error.message)
      return json(200, { ok: true, created: false, email }, cors)
    }

    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    })
    if (error) throw new HttpError(400, error.message)
    return json(200, { ok: true, created: true, email }, cors)
  } catch (e) {
    if (e instanceof HttpError) {
      return json(e.status, { error: e.message }, cors)
    }
    return json(500, { error: e instanceof Error ? e.message : "Server error" }, cors)
  }
})
