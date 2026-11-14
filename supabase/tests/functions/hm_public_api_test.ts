// Gap plan module 2: public API + webhook helpers, and the two functions refuse
// callers without a key / secret. Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1"
import {
  afterCursorFilter, bearerKey, clampLimit, decodeCursor, encodeCursor, hasScope, keyProblem, pageOf, parseRoute, RESOURCES, sha256Hex,
} from "../../functions/hm-public-api/lib.ts"
import { deliveredOk, isAllowedTarget, signatureHeader, verifySignature } from "../../functions/hm-webhook-dispatch/lib.ts"

const KEY = "hm_" + "ab".repeat(32)
const ID = "0f0e0d0c-0b0a-4908-8706-050403020100"

Deno.test("routes: versioned paths with or without the function prefix", () => {
  assertEquals(parseRoute("/hm-public-api/v1/accounts"), { kind: "list", resource: "accounts" })
  assertEquals(parseRoute("/functions/v1/hm-public-api/v1/invoices/" + ID.toUpperCase()), { kind: "get", resource: "invoices", id: ID })
  assertEquals(parseRoute("/hm-public-api/v1"), { kind: "root" })
  assertEquals(parseRoute("/hm-public-api/v1/crm"), null)
  assertEquals(parseRoute("/hm-public-api/v1/accounts/not-a-uuid"), null)
  assertEquals(parseRoute("/hm-public-api/v2/accounts"), null)
})

Deno.test("API key: bearer format, hash, revoked and expired refused", async () => {
  assertEquals(bearerKey(`Bearer ${KEY}`), KEY)
  assertEquals(bearerKey(KEY), null)
  assertEquals(bearerKey("Bearer hm_short"), null)
  assertEquals(bearerKey(null), null)
  assertEquals((await sha256Hex("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  const row = { id: "k", tenant_id: "t", scopes: ["accounts:read"], revoked_at: null, expires_at: null }
  assertEquals(keyProblem(null), "invalid_api_key")
  assertEquals(keyProblem(row), null)
  assertEquals(keyProblem({ ...row, revoked_at: "2026-01-01T00:00:00Z" }), "revoked_api_key")
  assertEquals(keyProblem({ ...row, expires_at: "2026-01-01T00:00:00Z" }, new Date("2026-06-01")), "expired_api_key")
})

Deno.test("scopes gate each resource", () => {
  assert(hasScope(["accounts:read"], "accounts"))
  assert(!hasScope(["accounts:read"], "invoices"))
  assert(!hasScope(null, "accounts"))
  assert(!hasScope(["accounts:read"], "nope"))
})

Deno.test("no internal or cost fields leave the API", () => {
  const all = Object.values(RESOURCES).flatMap((r) => r.fields)
  for (const bad of ["notes", "supplier_cost_base", "estimated_gross_profit_base", "created_by", "tenant_id", "pay_link_url", "contact_email"]) {
    assert(!all.includes(bad), `${bad} must not be exposed`)
  }
})

Deno.test("cursor pagination round trips and rejects junk", () => {
  const c = { t: "2026-11-14T10:00:00.000Z", id: ID }
  assertEquals(decodeCursor(encodeCursor(c)), c)
  assertEquals(decodeCursor("garbage"), null)
  assertEquals(decodeCursor(btoa(JSON.stringify({ t: "x", id: ID }))), null)
  assertEquals(decodeCursor(btoa(JSON.stringify({ t: c.t, id: "1),or(id.gt.0" }))), null)
  assertEquals(afterCursorFilter(c), `created_at.lt.${c.t},and(created_at.eq.${c.t},id.lt.${ID})`)
  assertEquals(clampLimit(null), 50)
  assertEquals(clampLimit("1000"), 200)
  assertEquals(clampLimit("-3"), 50)
  const rows = [1, 2, 3].map((i) => ({ id: ID, created_at: `2026-11-1${i}T00:00:00Z` }))
  assertEquals(pageOf(rows, 2).data.length, 2)
  assert(pageOf(rows, 2).next_cursor)
  assertEquals(pageOf(rows, 3).next_cursor, null)
})

Deno.test("webhook signature verifies, and tampering, wrong secret or old timestamps fail", async () => {
  const body = JSON.stringify({ type: "mark_paid" })
  const h = await signatureHeader("whsec_x", body, 1_700_000_000)
  assert(await verifySignature("whsec_x", body, h, 1_700_000_100))
  assert(!(await verifySignature("whsec_y", body, h, 1_700_000_100)))
  assert(!(await verifySignature("whsec_x", body + " ", h, 1_700_000_100)))
  assert(!(await verifySignature("whsec_x", body, h, 1_700_001_000)))
  assert(deliveredOk(204) && !deliveredOk(301) && !deliveredOk(500))
})

Deno.test("webhooks refuse internal targets", () => {
  assert(isAllowedTarget("https://hooks.example.com/x"))
  for (const bad of ["http://hooks.example.com", "https://localhost/x", "https://127.0.0.1/", "https://10.0.0.5/", "https://169.254.169.254/latest",
    "https://192.168.1.2/", "https://172.20.0.1/", "https://[::1]/", "https://user:pw@example.com/", "https://db.internal/"]) {
    assert(!isAllowedTarget(bad), bad)
  }
})

// ---- Behaviour: functions refuse callers without a key or secret -----------
type Handler = (req: Request) => Response | Promise<Response>
async function load(fn: string): Promise<Handler> {
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9")
  Deno.env.set("SUPABASE_ANON_KEY", "anon")
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service")
  Deno.env.set("WEBHOOK_CRON_SECRET", "webhook-secret-for-tests")
  const real = Deno.serve
  let captured: Handler | null = null
  // deno-lint-ignore no-explicit-any
  ;(Deno as any).serve = (...args: unknown[]) => {
    captured = args.find((a) => typeof a === "function") as Handler
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: {} }
  }
  try {
    await import(new URL(`../../functions/${fn}/index.ts`, import.meta.url).href)
  } finally {
    // deno-lint-ignore no-explicit-any
    ;(Deno as any).serve = real
  }
  assert(captured)
  return captured
}

Deno.test("hm-public-api refuses no key, malformed key, and writes", async () => {
  const h = await load("hm-public-api")
  const base = "https://x.supabase.co/functions/v1/hm-public-api/v1/accounts"
  for (const [init, want] of [
    [{}, 401],
    [{ headers: { Authorization: "Bearer nope" } }, 401],
    [{ method: "POST", headers: { Authorization: `Bearer ${KEY}` } }, 405],
  ] as [RequestInit, number][]) {
    const res = await h(new Request(base, init))
    await res.body?.cancel()
    assertEquals(res.status, want)
  }
})

Deno.test("hm-webhook-dispatch refuses a wrong secret and no sign in", async () => {
  const h = await load("hm-webhook-dispatch")
  const url = "https://x.supabase.co/functions/v1/hm-webhook-dispatch"
  let res = await h(new Request(url, { method: "POST", headers: { "x-cron-secret": "wrong" } }))
  await res.body?.cancel()
  assertEquals(res.status, 401)
  res = await h(new Request(url, { method: "POST" }))
  await res.body?.cancel()
  assertEquals(res.status, 401)
})
