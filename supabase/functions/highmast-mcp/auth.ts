// Who is calling, and a database client that acts as them.
//
// 1. The caller sends Authorization: Bearer hmk_... (an AI connector key).
// 2. We hash it (SHA-256) and ask the database, with the PUBLIC (anon) key,
//    rr_mcp_resolve_key(hash): is the key live, which team member does it act
//    as, and is it still under 60 calls this minute.
// 3. We sign a short-lived (5 minute) login token for that member, with the
//    project's JWT secret (MCP_JWT_SECRET), role "authenticated" and the
//    claim hm_mcp_key. Every query then runs as that member, so the normal
//    row level security rules apply, plus the "MCP ..." policies that block
//    deletes, HR, payroll, settings and secrets for AI sessions.
//
// The service role key is never used here.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"

export type McpKey = {
  keyId: string
  keyName: string
  role: "sales" | "staff" | "viewer" | "admin"
  /** "admin" keys get the admin tools (tools_admin.ts) and act as the AI Assistant admin member. */
  scope: "standard" | "admin"
  memberId: string
  memberName: string
  memberEmail: string
  authUserId: string
}

export type ResolveResult =
  | { ok: true; key: McpKey }
  | { ok: false; status: 401 | 429 | 503; error: string; retryAfter?: number }

const env = (name: string) => Deno.env.get(name) || ""

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

function b64url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const b64urlText = (text: string) => b64url(new TextEncoder().encode(text))

/** HS256 JWT, the same kind Supabase Auth issues with the project's JWT secret. */
export async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const head = b64urlText(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64urlText(JSON.stringify(claims))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64url(sig)}`
}

/** A login token for the member the key acts as, good for 5 minutes. */
export function sessionClaims(key: McpKey, nowSeconds = Math.floor(Date.now() / 1000)): Record<string, unknown> {
  return {
    iss: "highmast-mcp",
    aud: "authenticated",
    role: "authenticated",
    sub: key.authUserId,
    email: key.memberEmail,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    // Read by public.rr_mcp_key_id(): marks this as an AI session in the database.
    hm_mcp_key: key.keyId,
    hm_mcp_key_name: key.keyName,
  }
}

type ResolveRow = {
  key_id: string
  key_name: string
  role: McpKey["role"]
  scope?: McpKey["scope"]
  member_id: string
  member_name: string
  member_email: string
  auth_user_id: string
  allowed: boolean
  retry_after_seconds: number
}

/** Checks the key with the database (public key only) and counts the call. */
export async function resolveKey(rawKey: string, fetcher: typeof fetch = fetch): Promise<ResolveResult> {
  const url = env("SUPABASE_URL").replace(/\/$/, "")
  const anon = env("SUPABASE_ANON_KEY")
  if (!url || !anon || !env("MCP_JWT_SECRET")) {
    return { ok: false, status: 503, error: "The HighMast connector is not set up yet (MCP_JWT_SECRET missing)." }
  }
  const hash = await sha256Hex(rawKey)
  let rows: ResolveRow[] = []
  try {
    const res = await fetcher(`${url}/rest/v1/rpc/rr_mcp_resolve_key`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key_hash: hash }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      await res.body?.cancel()
      return { ok: false, status: 503, error: "Could not check the key. Has the HighMast MCP SQL been run?" }
    }
    rows = (await res.json()) as ResolveRow[]
  } catch {
    return { ok: false, status: 503, error: "Could not reach the HighMast database." }
  }
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) return { ok: false, status: 401, error: "Invalid or revoked key." }
  if (!row.allowed) {
    return { ok: false, status: 429, error: "Rate limit: 60 calls a minute per key. Try again shortly.", retryAfter: row.retry_after_seconds || 30 }
  }
  return {
    ok: true,
    key: {
      keyId: row.key_id,
      keyName: row.key_name,
      role: row.role,
      scope: row.scope === "admin" && row.role === "admin" ? "admin" : "standard",
      memberId: row.member_id,
      memberName: row.member_name || row.member_email,
      memberEmail: row.member_email,
      authUserId: row.auth_user_id,
    },
  }
}

/** A database client that acts as the key's member (RLS applies). Never the service role. */
export async function memberClient(key: McpKey): Promise<SupabaseClient> {
  const token = await signJwt(sessionClaims(key), env("MCP_JWT_SECRET"))
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}
