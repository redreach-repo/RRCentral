// Which Supabase API keys the Edge Functions use.
//
// Supabase now gives every function two kinds of keys:
//   - the new ones, SUPABASE_SECRET_KEYS and SUPABASE_PUBLISHABLE_KEYS
//     (JSON objects keyed by name, "default" is the one made on the
//     API Keys page), and
//   - the legacy JWT ones, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY.
//
// The functions prefer the new keys, so the legacy keys can be switched
// off in Settings > API Keys without breaking anything. Until the new keys
// exist the legacy ones are used, exactly as before.

type EnvGet = (name: string) => string | undefined

const denoEnv: EnvGet = (name) => {
  try {
    return Deno.env.get(name)
  } catch {
    return undefined
  }
}

/** The "default" key (or the first one) from a SUPABASE_*_KEYS JSON object. */
export function pickNamedKey(raw: string | undefined, name = "default"): string | undefined {
  const text = String(raw || "").trim()
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === "string") return parsed.trim() || undefined
    if (parsed && typeof parsed === "object") {
      const keys = parsed as Record<string, unknown>
      const chosen = keys[name] ?? Object.values(keys)[0]
      return typeof chosen === "string" && chosen.trim() ? chosen.trim() : undefined
    }
  } catch {
    // A single bare key rather than JSON.
    if (/^sb_(secret|publishable)_/.test(text)) return text
  }
  return undefined
}

/** Server key that bypasses row level security: new secret key, else legacy service_role. */
export function serviceRoleKey(get: EnvGet = denoEnv): string | undefined {
  return pickNamedKey(get("SUPABASE_SECRET_KEYS")) || get("SUPABASE_SERVICE_ROLE_KEY") || undefined
}

/** Public key (row level security applies): new publishable key, else legacy anon. */
export function publicApiKey(get: EnvGet = denoEnv): string | undefined {
  return pickNamedKey(get("SUPABASE_PUBLISHABLE_KEYS")) || get("SUPABASE_ANON_KEY") || undefined
}

/** "new" when both new keys are in use, "legacy" otherwise (for the System check). */
export function supabaseKeyKind(get: EnvGet = denoEnv): "new" | "legacy" {
  const service = serviceRoleKey(get)
  const pub = publicApiKey(get)
  return service && pub && !isJwtKey(service) && !isJwtKey(pub) ? "new" : "legacy"
}

/** True for a legacy JWT key (eyJ...), false for sb_secret_ / sb_publishable_ keys. */
export function isJwtKey(key: string | undefined): boolean {
  return /^eyJ[\w-]*\.[\w-]+\.[\w-]*$/.test(String(key || ""))
}

/**
 * Headers for a raw REST call made with a project key. New keys are not
 * JWTs and must go on the apikey header only; a legacy key also goes on
 * Authorization, as before.
 */
export function keyHeaders(key: string): Record<string, string> {
  return isJwtKey(key) ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key }
}
