// One-shot / ops helper: ensure info@redreach.ae exists with the default password.
// Prefer the SQL migration 20261006170000_default_admin_info.sql when possible.
// Deploy with --no-verify-jwt if calling without a user session.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const ADMIN_EMAIL = "info@redreach.ae"
const ADMIN_PASSWORD = "RedReach2026#"
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  try {
    const admin = adminClient()
    const existingId = await findAuthUserId(admin, ADMIN_EMAIL)

    if (existingId) {
      const { error } = await admin.auth.admin.updateUserById(existingId, {
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { name: ADMIN_NAME },
      })
      if (error) return json(400, { error: error.message }, cors)
    } else {
      const { error } = await admin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
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
        hint: "Sign in, then change this password under Settings → My password.",
      },
      cors,
    )
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Server error" }, cors)
  }
})
