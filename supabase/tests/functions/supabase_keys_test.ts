import { assertEquals } from "jsr:@std/assert@1"
import { isJwtKey, supabaseKeyKind, keyHeaders, pickNamedKey, publicApiKey, serviceRoleKey } from "../../functions/_shared/supabaseKeys.ts"

const envOf = (vars: Record<string, string>) => (name: string) => vars[name]
const LEGACY_SERVICE = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig"
const LEGACY_ANON = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig"

Deno.test("legacy keys are used until the new keys exist", () => {
  const get = envOf({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE, SUPABASE_ANON_KEY: LEGACY_ANON })
  assertEquals(serviceRoleKey(get), LEGACY_SERVICE)
  assertEquals(publicApiKey(get), LEGACY_ANON)
})

Deno.test("new secret and publishable keys win over the legacy ones", () => {
  const get = envOf({
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE,
    SUPABASE_ANON_KEY: LEGACY_ANON,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_new" }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "sb_publishable_new" }),
  })
  assertEquals(serviceRoleKey(get), "sb_secret_new")
  assertEquals(publicApiKey(get), "sb_publishable_new")
})

Deno.test("named key: default first, else the first one, bad JSON ignored", () => {
  assertEquals(pickNamedKey(JSON.stringify({ other: "sb_secret_a", default: "sb_secret_b" })), "sb_secret_b")
  assertEquals(pickNamedKey(JSON.stringify({ other: "sb_secret_a" })), "sb_secret_a")
  assertEquals(pickNamedKey("{not json"), undefined)
  assertEquals(pickNamedKey(""), undefined)
  assertEquals(pickNamedKey("sb_secret_bare"), "sb_secret_bare")
})

Deno.test("an empty new-keys object falls back to legacy", () => {
  const get = envOf({ SUPABASE_SECRET_KEYS: "{}", SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE })
  assertEquals(serviceRoleKey(get), LEGACY_SERVICE)
})

Deno.test("new keys go on apikey only, legacy JWT keys also on Authorization", () => {
  assertEquals(isJwtKey(LEGACY_SERVICE), true)
  assertEquals(isJwtKey("sb_secret_new"), false)
  assertEquals(keyHeaders("sb_secret_new"), { apikey: "sb_secret_new" })
  assertEquals(keyHeaders(LEGACY_SERVICE), { apikey: LEGACY_SERVICE, Authorization: `Bearer ${LEGACY_SERVICE}` })
})

Deno.test("key kind for the System check", () => {
  assertEquals(supabaseKeyKind(envOf({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE, SUPABASE_ANON_KEY: LEGACY_ANON })), "legacy")
  assertEquals(supabaseKeyKind(envOf({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_new" }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "sb_publishable_new" }),
  })), "new")
})
