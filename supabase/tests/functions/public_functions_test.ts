// Every Edge Function with verify_jwt = false in supabase/config.toml must
// check its caller itself. Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
//
// 1. Static: each such function is listed in GUARDS below and its code holds
//    that guard. A new public function without an entry here fails CI.
// 2. Behaviour: the functions are loaded with Deno.serve stubbed out and
//    called with no secret, a wrong secret or no signature. They must refuse.
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1"

const ROOT = new URL("../../", import.meta.url)
const read = (path: string) => Deno.readTextFile(new URL(path, ROOT))

/** How each public function checks its caller, and the code that proves it. */
const GUARDS: Record<string, { kind: string; pattern: RegExp }> = {
  "usage-import": { kind: "cron secret or manager JWT", pattern: /x-cron-secret[\s\S]*providedSecret !== cronSecret[\s\S]*rr_is_manager_or_admin/ },
  "daily-digest": { kind: "cron secret or manager JWT", pattern: /x-cron-secret[\s\S]*providedSecret !== cronSecret[\s\S]*rr_is_manager_or_admin/ },
  "contract-invoices": { kind: "cron secret or manager JWT", pattern: /x-cron-secret[\s\S]*providedSecret !== cronSecret[\s\S]*rr_is_manager_or_admin/ },
  "client-portal": { kind: "hashed link token", pattern: /isPortalToken\(token\)[\s\S]*token_hash[\s\S]*portalAccessState/ },
  "ai-assist": { kind: "signed in user (JWT read in code)", pattern: /auth\.getUser\(jwt\)[\s\S]*if \(!who\?\.user\)/ },
  "whatsapp-in": { kind: "Meta signature", pattern: /if \(!appSecret\)[\s\S]*validSignature\(raw, req\.headers\.get\("x-hub-signature-256"\)/ },
  "whatsapp-send": { kind: "signed in user (JWT read in code)", pattern: /auth\.getUser\(jwt\)[\s\S]*if \(!who\?\.user\)/ },
  "create-checkout-session": { kind: "allowed origin and public key", pattern: /allowedOrigins\(\)\.includes\(origin\)[\s\S]*shopKeyOk\(/ },
  "support-email-in": { kind: "shared secret", pattern: /if \(!expected\)[\s\S]*provided !== expected/ },
  "teetribe-order-sync": { kind: "shared secret", pattern: /if \(!expected \|\| provided !== expected\)/ },
  "bootstrap-admin": { kind: "shared secret", pattern: /x-bootstrap-secret[\s\S]*Forbidden/ },
  "manage-auth-user": { kind: "admin JWT", pattern: /admin\.auth\.getUser\(jwt\)/ },
  "zoho-proxy": { kind: "team member JWT", pattern: /admin\.auth\.getUser\(jwt\)[\s\S]*member\?\.active/ },
}

async function publicFunctions(): Promise<string[]> {
  const toml = await read("config.toml")
  const names: string[] = []
  for (const m of toml.matchAll(/\[functions\.([a-z0-9-]+)\]\s*\n\s*verify_jwt\s*=\s*false/g)) names.push(m[1])
  return names
}

Deno.test("the seven outside-facing functions have verify_jwt off", async () => {
  const names = await publicFunctions()
  for (const fn of ["usage-import", "daily-digest", "client-portal", "ai-assist", "whatsapp-in", "whatsapp-send", "create-checkout-session"]) {
    assert(names.includes(fn), `${fn} is missing from supabase/config.toml with verify_jwt = false`)
  }
})

Deno.test("every verify_jwt = false function has its own auth check", async () => {
  for (const fn of await publicFunctions()) {
    const guard = GUARDS[fn]
    assert(guard, `${fn} has verify_jwt = false but no guard is listed in public_functions_test.ts`)
    const source = await read(`functions/${fn}/index.ts`)
    assert(guard.pattern.test(source), `${fn} should check its caller (${guard.kind}) but the check was not found`)
  }
})

// ---- Behaviour -------------------------------------------------------------

type Handler = (req: Request) => Response | Promise<Response>
const handlers = new Map<string, Handler>()

const ENV: Record<string, string> = {
  SUPABASE_URL: "http://127.0.0.1:9",
  SUPABASE_ANON_KEY: "test-public-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  USAGE_IMPORT_CRON_SECRET: "usage-secret-for-tests",
  DIGEST_CRON_SECRET: "digest-secret-for-tests",
  CONTRACT_BILLING_CRON_SECRET: "billing-secret-for-tests",
  WHATSAPP_APP_SECRET: "meta-app-secret-for-tests",
  WHATSAPP_VERIFY_TOKEN: "meta-verify-token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  META_ACCESS_TOKEN: "meta-token",
  ANTHROPIC_API_KEY: "test-anthropic",
  SUPPORT_INBOUND_SECRET: "support-secret-for-tests",
  CRM_SYNC_SECRET: "crm-sync-secret-for-tests",
}

async function load(fn: string): Promise<Handler> {
  const cached = handlers.get(fn)
  if (cached) return cached
  for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v)
  const real = Deno.serve
  let captured: Handler | null = null
  // deno-lint-ignore no-explicit-any
  ;(Deno as any).serve = (...args: unknown[]) => {
    captured = args.find((a) => typeof a === "function") as Handler
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: {} }
  }
  try {
    await import(new URL(`functions/${fn}/index.ts`, ROOT).href)
  } finally {
    // deno-lint-ignore no-explicit-any
    ;(Deno as any).serve = real
  }
  assert(captured, `${fn} did not call Deno.serve`)
  handlers.set(fn, captured)
  return captured
}

const URL_BASE = "https://example.supabase.co/functions/v1/"
const post = (fn: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_BASE + fn, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

async function call(fn: string, req: Request): Promise<number> {
  const res = await (await load(fn))(req)
  await res.body?.cancel()
  return res.status
}

async function metaSignature(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))
  return "sha256=" + Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")
}

const opts = { sanitizeOps: false, sanitizeResources: false }

for (const fn of ["usage-import", "daily-digest", "contract-invoices"]) {
  Deno.test({ name: `${fn} refuses no secret and a wrong secret`, ...opts, fn: async () => {
    assertEquals(await call(fn, post(fn, {})), 401)
    assertEquals(await call(fn, post(fn, {}, { "x-cron-secret": "wrong" })), 401)
  } })
}

Deno.test({ name: "contract-invoices refuses a signed in user who is not a manager or admin", ...opts, fn: async () => {
  // The role check cannot confirm this token, so the caller counts as staff, sales or viewer.
  assertEquals(await call("contract-invoices", post("contract-invoices", {}, { Authorization: "Bearer someone" })), 403)
} })

Deno.test({ name: "contract-invoices fails closed without its schedule secret", ...opts, fn: async () => {
  Deno.env.delete("CONTRACT_BILLING_CRON_SECRET")
  try {
    assertEquals(await call("contract-invoices", post("contract-invoices", {}, { "x-cron-secret": ENV.CONTRACT_BILLING_CRON_SECRET })), 401)
  } finally {
    Deno.env.set("CONTRACT_BILLING_CRON_SECRET", ENV.CONTRACT_BILLING_CRON_SECRET)
  }
} })

Deno.test({ name: "client-portal refuses a missing or malformed link token", ...opts, fn: async () => {
  assertEquals(await call("client-portal", post("client-portal", {})), 404)
  assertEquals(await call("client-portal", post("client-portal", { token: "guess" })), 404)
} })

for (const fn of ["ai-assist", "whatsapp-send"]) {
  Deno.test({ name: `${fn} refuses a caller who is not signed in`, ...opts, fn: async () => {
    assertEquals(await call(fn, post(fn, {})), 401)
    assertEquals(await call(fn, post(fn, {}, { Authorization: "Bearer " })), 401)
  } })
}

Deno.test({ name: "whatsapp-in only accepts Meta's signature", ...opts, fn: async () => {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] })
  assertEquals(await call("whatsapp-in", post("whatsapp-in", raw)), 401)
  assertEquals(await call("whatsapp-in", post("whatsapp-in", raw, { "x-hub-signature-256": await metaSignature(raw, "not-the-secret") })), 401)
  const verify = new Request(URL_BASE + "whatsapp-in?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")
  assertEquals(await call("whatsapp-in", verify), 403)
  // Positive control: Meta's own signature gets past the check.
  const good = await metaSignature(raw, ENV.WHATSAPP_APP_SECRET)
  assertNotEquals(await call("whatsapp-in", post("whatsapp-in", raw, { "x-hub-signature-256": good })), 401)
  // Fail closed without the app secret.
  Deno.env.delete("WHATSAPP_APP_SECRET")
  try {
    assertEquals(await call("whatsapp-in", post("whatsapp-in", raw, { "x-hub-signature-256": good })), 500)
  } finally {
    Deno.env.set("WHATSAPP_APP_SECRET", ENV.WHATSAPP_APP_SECRET)
  }
} })

Deno.test({ name: "create-checkout-session needs the shop's origin and public key", ...opts, fn: async () => {
  const fn = "create-checkout-session"
  const origin = "https://redreach-repo.github.io"
  assertEquals(await call(fn, post(fn, {})), 403)
  assertEquals(await call(fn, post(fn, {}, { Origin: "https://evil.example" })), 403)
  assertEquals(await call(fn, post(fn, {}, { Origin: origin })), 401)
  assertEquals(await call(fn, post(fn, {}, { Origin: origin, apikey: "wrong" })), 401)
  // Positive control: with both, it reaches request validation.
  assertEquals(await call(fn, post(fn, "not json", { Origin: origin, apikey: ENV.SUPABASE_ANON_KEY })), 400)
} })

for (const [fn, header] of [["support-email-in", "x-support-secret"], ["teetribe-order-sync", "x-crm-sync-secret"]]) {
  Deno.test({ name: `${fn} refuses no secret and a wrong secret`, ...opts, fn: async () => {
    assertEquals(await call(fn, post(fn, {})), 401)
    assertEquals(await call(fn, post(fn, {}, { [header]: "wrong" })), 401)
  } })
}
