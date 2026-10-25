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
  "watchdog": { kind: "cron secret or manager JWT", pattern: /x-cron-secret[\s\S]*providedSecret !== cronSecret[\s\S]*rr_is_manager_or_admin/ },
  "contract-invoices": { kind: "cron secret or manager JWT", pattern: /x-cron-secret[\s\S]*providedSecret !== cronSecret[\s\S]*rr_is_manager_or_admin/ },
  "client-portal": { kind: "hashed link token", pattern: /isPortalToken\(token\)[\s\S]*token_hash[\s\S]*portalAccessState/ },
  "quote-accept": { kind: "hashed link token", pattern: /isAcceptToken\(token\)[\s\S]*token_hash[\s\S]*acceptLinkState/ },
  "ai-assist": { kind: "signed in user (JWT read in code)", pattern: /auth\.getUser\(jwt\)[\s\S]*if \(!who\?\.user\)/ },
  "whatsapp-in": { kind: "Meta signature", pattern: /if \(!appSecret\)[\s\S]*validSignature\(raw, req\.headers\.get\("x-hub-signature-256"\)/ },
  "whatsapp-send": { kind: "signed in user (JWT read in code)", pattern: /auth\.getUser\(jwt\)[\s\S]*if \(!who\?\.user\)/ },
  "fireflies-fetch": { kind: "signed in user (JWT read in code) who can write the account", pattern: /auth\.getUser\(jwt\)[\s\S]*if \(!who\?\.user\)[\s\S]*rr_can_write_account/ },
  "invoice-pay-link": { kind: "signed in team member (JWT read in code)", pattern: /auth\.getUser\(jwt\)[\s\S]*if \(!who\?\.user\)[\s\S]*rr_is_staff/ },
  "stripe-invoice-webhook": { kind: "Stripe signature", pattern: /if \(!webhookSecret[\s\S]*constructEventAsync\(raw, signature, webhookSecret/ },
  "create-checkout-session": { kind: "allowed origin and public key", pattern: /allowedOrigins\(\)\.includes\(origin\)[\s\S]*shopKeyOk\(/ },
  "support-email-in": { kind: "shared secret", pattern: /if \(!expected\)[\s\S]*provided !== expected/ },
  "teetribe-order-sync": { kind: "shared secret", pattern: /if \(!expected \|\| provided !== expected\)/ },
  "bootstrap-admin": { kind: "shared secret", pattern: /x-bootstrap-secret[\s\S]*Forbidden/ },
  "manage-auth-user": { kind: "admin JWT", pattern: /admin\.auth\.getUser\(jwt\)/ },
  "zoho-proxy": { kind: "team member JWT", pattern: /admin\.auth\.getUser\(jwt\)[\s\S]*member\?\.active/ },
  "client-reports": { kind: "cron secret, manager JWT to build, team JWT to send", pattern: /x-cron-secret[\s\S]*providedSecret !== cronSecret[\s\S]*auth\.getUser\(jwt\)[\s\S]*if \(!who\?\.user\)[\s\S]*rr_is_manager_or_admin[\s\S]*rr_is_staff[\s\S]*rr_can_write_account/ },
  "lead-intake": { kind: "shared secret or signed form token", pattern: /if \(!secret\)[\s\S]*=== secret[\s\S]*formTokenProblem\(/ },
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
  WATCHDOG_CRON_SECRET: "watchdog-secret-for-tests",
  CONTRACT_BILLING_CRON_SECRET: "billing-secret-for-tests",
  WHATSAPP_APP_SECRET: "meta-app-secret-for-tests",
  WHATSAPP_VERIFY_TOKEN: "meta-verify-token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  META_ACCESS_TOKEN: "meta-token",
  ANTHROPIC_API_KEY: "test-anthropic",
  SUPPORT_INBOUND_SECRET: "support-secret-for-tests",
  CRM_SYNC_SECRET: "crm-sync-secret-for-tests",
  LEAD_INTAKE_SECRET: "lead-secret-for-tests",
  RR_STRIPE_SECRET_KEY: "sk_test_for_tests",
  RR_STRIPE_WEBHOOK_SECRET: "whsec_for_tests",
  CLIENT_REPORT_CRON_SECRET: "report-secret-for-tests",
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

for (const fn of ["usage-import", "daily-digest", "contract-invoices", "watchdog", "client-reports"]) {
  Deno.test({ name: `${fn} refuses no secret and a wrong secret`, ...opts, fn: async () => {
    assertEquals(await call(fn, post(fn, {})), 401)
    assertEquals(await call(fn, post(fn, {}, { "x-cron-secret": "wrong" })), 401)
  } })
}

Deno.test({ name: "watchdog refuses a signed in user who is not a manager or admin", ...opts, fn: async () => {
  // The role check cannot confirm this token, so the caller counts as staff, sales or viewer.
  assertEquals(await call("watchdog", post("watchdog", {}, { Authorization: "Bearer someone" })), 403)
} })

Deno.test({ name: "watchdog fails closed without its schedule secret", ...opts, fn: async () => {
  Deno.env.delete("WATCHDOG_CRON_SECRET")
  try {
    assertEquals(await call("watchdog", post("watchdog", {}, { "x-cron-secret": ENV.WATCHDOG_CRON_SECRET })), 401)
  } finally {
    Deno.env.set("WATCHDOG_CRON_SECRET", ENV.WATCHDOG_CRON_SECRET)
  }
} })

Deno.test({ name: "contract-invoices refuses a signed in user who is not a manager or admin", ...opts, fn: async () => {
  // The role check cannot confirm this token, so the caller counts as staff, sales or viewer.
  assertEquals(await call("contract-invoices", post("contract-invoices", {}, { Authorization: "Bearer someone" })), 403)
} })

Deno.test({ name: "client-reports refuses an unknown sign in and lets the schedule only build", ...opts, fn: async () => {
  assertEquals(await call("client-reports", post("client-reports", { action: "send", draft_id: "00000000-0000-0000-0000-000000000001" })), 401)
  assertEquals(await call("client-reports", post("client-reports", { action: "send" }, { Authorization: "Bearer someone" })), 401)
  assertEquals(
    await call("client-reports", post("client-reports", { action: "send" }, { "x-cron-secret": ENV.CLIENT_REPORT_CRON_SECRET })),
    403,
  )
  Deno.env.delete("CLIENT_REPORT_CRON_SECRET")
  try {
    assertEquals(await call("client-reports", post("client-reports", {}, { "x-cron-secret": ENV.CLIENT_REPORT_CRON_SECRET })), 401)
  } finally {
    Deno.env.set("CLIENT_REPORT_CRON_SECRET", ENV.CLIENT_REPORT_CRON_SECRET)
  }
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

Deno.test({ name: "client-portal actions need a valid link token too", ...opts, fn: async () => {
  for (const body of [
    { action: "accept_quote", quote_id: "00000000-0000-0000-0000-000000000001", name: "Guess", date: "2026-10-25", agreed: true },
    { action: "upload", filename: "a.pdf", content_base64: "aGVsbG8=" },
    { action: "ticket_message", ticket_id: "00000000-0000-0000-0000-000000000001", message: "hi" },
    { action: "quote_pdf", quote_id: "00000000-0000-0000-0000-000000000001" },
  ]) {
    assertEquals(await call("client-portal", post("client-portal", body)), 404)
    assertEquals(await call("client-portal", post("client-portal", { ...body, token: "guess" })), 404)
  }
} })

Deno.test("client-portal checks the link and the account before any action", async () => {
  const source = await read("functions/client-portal/index.ts")
  const guard = source.indexOf('type !== "ai_crm_client"')
  assert(guard > source.indexOf("portalAccessState("), "the account check comes after the link check")
  for (const action of ["quote_pdf", "accept_quote", "ticket_message", "upload"]) {
    const at = source.indexOf(`action === "${action}"`)
    assert(at > guard, `${action} is only handled after the link and account checks`)
  }
  // Every row an action touches is looked up with this link's account.
  assert(/from\("quotations"\)[\s\S]*?\.eq\("account_id", accountId\)/.test(source), "quotes are limited to the link's account")
  assert(/from\("tickets"\)[\s\S]*?\.eq\("account_id", accountId\)/.test(source), "tickets are limited to the link's account")
})

for (const fn of ["ai-assist", "whatsapp-send", "fireflies-fetch", "invoice-pay-link"]) {
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

Deno.test({ name: "lead-intake needs its secret or a signed form token", ...opts, fn: async () => {
  const fn = "lead-intake"
  const lead = { name: "Test Lead", email: "lead@example.com", message: "Hi" }
  assertEquals(await call(fn, post(fn, lead)), 401)
  assertEquals(await call(fn, post(fn, lead, { "x-lead-secret": "wrong" })), 401)
  assertEquals(await call(fn, post(fn, { ...lead, form_token: "1700000000000.forged" })), 401)
  // A real token straight away is refused too: people take longer than 3 seconds.
  const tokenRes = await (await load(fn))(new Request(URL_BASE + fn + "?form_token=1"))
  const { form_token } = await tokenRes.json()
  assertEquals(await call(fn, post(fn, { ...lead, form_token })), 401)
  // Positive control: the secret gets past the check to lead validation.
  assertEquals(await call(fn, post(fn, { message: "no name" }, { "x-lead-secret": ENV.LEAD_INTAKE_SECRET })), 400)
  // Fail closed without the secret.
  Deno.env.delete("LEAD_INTAKE_SECRET")
  try {
    assertEquals(await call(fn, post(fn, lead, { "x-lead-secret": ENV.LEAD_INTAKE_SECRET })), 503)
  } finally {
    Deno.env.set("LEAD_INTAKE_SECRET", ENV.LEAD_INTAKE_SECRET)
  }
} })

Deno.test({ name: "quote-accept refuses a missing or malformed link token", ...opts, fn: async () => {
  const fn = "quote-accept"
  assertEquals(await call(fn, post(fn, {})), 404)
  assertEquals(await call(fn, post(fn, { token: "guess" })), 404)
  assertEquals(await call(fn, post(fn, { token: "guess", action: "accept", name: "Someone", agreed: true })), 404)
  assertEquals(await call(fn, post(fn, { token: "x".repeat(44), action: "pdf" })), 404)
} })

Deno.test({ name: "stripe-invoice-webhook only believes Stripe's signature", ...opts, fn: async () => {
  const fn = "stripe-invoice-webhook"
  const raw = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { metadata: { invoice_id: "x", source: "rr-central" } } } })
  assertEquals(await call(fn, post(fn, raw)), 401)
  assertEquals(await call(fn, post(fn, raw, { "stripe-signature": "t=1,v1=forged" })), 401)
  // Fail closed without the signing secret.
  Deno.env.delete("RR_STRIPE_WEBHOOK_SECRET")
  try {
    assertEquals(await call(fn, post(fn, raw, { "stripe-signature": "t=1,v1=forged" })), 500)
  } finally {
    Deno.env.set("RR_STRIPE_WEBHOOK_SECRET", ENV.RR_STRIPE_WEBHOOK_SECRET)
  }
} })
