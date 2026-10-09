// Optional one-shot admin bootstrap. DISABLED unless Supabase secrets are set:
//   BOOTSTRAP_ADMIN_SECRET (32+ chars) — send as header x-bootstrap-secret
//   BOOTSTRAP_ADMIN_PASSWORD (12+ chars) — applied only when the secret matches
// Prefer manage-auth-user (admin JWT) or the Supabase Auth dashboard for day-to-day use.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const ADMIN_EMAIL = "info@redreach.ae"
const ADMIN_NAME = "Red Reach"

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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-bootstrap-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
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
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

async function findAuthUserId(
  admin: ReturnType<typeof adminClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = (data.users || []).find((u) => (u.email || "").toLowerCase() === target)
    if (hit) return hit.id
    if (!data.users?.length || data.users.length < 200) return null
    page += 1
    if (page > 20) return null
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req)
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json(405, { error: "POST only" }, cors)

  const configuredSecret = (Deno.env.get("BOOTSTRAP_ADMIN_SECRET") || "").trim()
  const configuredPassword = (Deno.env.get("BOOTSTRAP_ADMIN_PASSWORD") || "").trim()

  if (configuredSecret.length < 32 || configuredPassword.length < 12) {
    return json(
      503,
      {
        error: "bootstrap-admin is disabled",
        hint:
          "Set Supabase secrets BOOTSTRAP_ADMIN_SECRET (32+ chars) and BOOTSTRAP_ADMIN_PASSWORD (12+ chars), or use manage-auth-user / Auth dashboard instead.",
      },
      cors,
    )
  }

  const providedSecret = (req.headers.get("x-bootstrap-secret") || "").trim()
  if (!providedSecret || !timingSafeEqual(providedSecret, configuredSecret)) {
    return json(403, { error: "Forbidden" }, cors)
  }

  try {
    const admin = adminClient()
    const existingId = await findAuthUserId(admin, ADMIN_EMAIL)

    if (existingId) {
      const { error } = await admin.auth.admin.updateUserById(existingId, {
        password: configuredPassword,
        email_confirm: true,
        user_metadata: { name: ADMIN_NAME },
      })
      if (error) return json(400, { error: error.message }, cors)
    } else {
      const { error } = await admin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: configuredPassword,
        email_confirm: true,
        user_metadata: { name: ADMIN_NAME },
      })
      if (error) return json(400, { error: error.message }, cors)
    }

    const { error: upsertError } = await admin.from("app_users").upsert(
      {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        role: "admin",
        active: true,
      },
      { onConflict: "email" },
    )
    if (upsertError) return json(400, { error: upsertError.message }, cors)

    return json(
      200,
      {
        ok: true,
        email: ADMIN_EMAIL,
        created: !existingId,
        hint: "Sign in and change the password under Settings → My password.",
      },
      cors,
    )
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Server error" }, cors)
  }
})
