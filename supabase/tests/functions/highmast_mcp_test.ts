// HighMast MCP server (supabase/functions/highmast-mcp).
// Run: deno test --allow-env --allow-read --allow-net supabase/tests/functions/
//
// 1. Static: the tool list is exactly the agreed one, with no delete, HR,
//    payroll, secrets, settings or users tools; the code never deletes and never
//    names an HR, payroll, settings or keys table; no service role key.
// 2. Behaviour, with the database faked: no key / bad key / revoked key are
//    refused before anything runs, the 61st call in a minute gets 429, a good key
//    lists the tools, every database call uses the public key plus a login token
//    for the key's member (role authenticated, hm_mcp_key claim), and every tool
//    call is written to the audit log.
// The database side (RLS: a sales key cannot read HR or payroll and cannot
// delete) is proven in supabase/tests/modules/highmast_mcp_test.sql.
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1"

const ROOT = new URL("../../", import.meta.url)
const read = (path: string) => Deno.readTextFile(new URL(path, ROOT))
const FN = "functions/highmast-mcp/"

const EXPECTED_TOOLS = [
  "add_timeline_note", "create_follow_up", "create_lead", "dashboard_summary", "get_account", "get_deal",
  "get_ticket", "list_deals", "list_follow_ups_due", "list_invoices", "list_quotes", "list_tickets",
  "move_deal_stage", "search_accounts",
]

Deno.test("the code never deletes, never uses the service key, never names HR, payroll, settings or keys tables", async () => {
  for (const file of ["index.ts", "auth.ts", "tools.ts"]) {
    const src = await read(FN + file)
    assertFalse(/\.delete\(/.test(src), `${file} calls .delete(`)
    assertFalse(/SERVICE_ROLE/.test(src), `${file} reads the service role key`)
    for (const table of ["hr_employees", "hr_attendance", "hr_leave", "payroll", "app_settings", "mcp_keys", "api_keys", "webhook_endpoints", "audit_log", "mail_accounts"]) {
      assertFalse(new RegExp(`from\\("${table}`).test(src), `${file} queries ${table}`)
    }
  }
  // The only users query is the name lookup for owners: id, name and email.
  const tools = await read(FN + "tools.ts")
  for (const m of tools.matchAll(/from\("app_users"\)\.select\("([^"]*)"\)/g)) assertEquals(m[1], "id, name, email")
  assertFalse(/from\("app_users"\)\.(insert|update|upsert)/.test(tools))
})

Deno.test("money tables are read only: no insert or update on quotations, invoices or payments", async () => {
  const tools = await read(FN + "tools.ts")
  for (const table of ["quotations", "invoices", "customer_payments", "payment_log", "income", "expenses"]) {
    assertFalse(new RegExp(`from\\("${table}"\\)\\s*\\.(insert|update|upsert)`).test(tools), `${table} is written`)
  }
})

// ---- Behaviour --------------------------------------------------------------

const KEY = "hmk_" + "A".repeat(43)
const ENV: Record<string, string> = {
  SUPABASE_URL: "http://db.test",
  SUPABASE_ANON_KEY: "public-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-must-not-be-used",
  MCP_JWT_SECRET: "jwt-secret-for-tests-0123456789abcdef",
}

type Call = { url: URL; method: string; headers: Headers; body: string }
const calls: Call[] = []
let resolveRows: unknown[] = []

const MEMBER = {
  key_id: "11111111-1111-4111-8111-111111111111",
  key_name: "Grok Bot",
  role: "sales",
  member_id: "22222222-2222-4222-8222-222222222222",
  member_name: "Grok Bot",
  member_email: "grokbot@redreach.ae",
  auth_user_id: "33333333-3333-4333-8333-333333333333",
  allowed: true,
  retry_after_seconds: 30,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

async function fakeFetch(input: Request | URL | string, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init)
  const url = new URL(req.url)
  calls.push({ url, method: req.method, headers: req.headers, body: req.method === "GET" ? "" : await req.text() })
  if (url.pathname === "/rest/v1/rpc/rr_mcp_resolve_key") return json(resolveRows)
  if (url.pathname === "/rest/v1/rpc/rr_mcp_log_call") return new Response(null, { status: 204 })
  if (url.pathname === "/rest/v1/crm") {
    return json([{ id: "44444444-4444-4444-8444-444444444444", company_name: "Acme LLC", pipeline_stage: "Lead", owner: "Sara", updated_at: "2026-11-01T00:00:00Z" }])
  }
  if (url.pathname.startsWith("/rest/v1/")) return json([])
  return json({}, 404)
}

type Handler = (req: Request) => Response | Promise<Response>
let handler: Handler | null = null

async function load(): Promise<Handler> {
  if (handler) return handler
  for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v)
  const real = Deno.serve
  // deno-lint-ignore no-explicit-any
  ;(Deno as any).serve = (...args: unknown[]) => {
    handler = args.find((a) => typeof a === "function") as Handler
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: {} }
  }
  try {
    await import(new URL(FN + "index.ts", ROOT).href)
  } finally {
    // deno-lint-ignore no-explicit-any
    ;(Deno as any).serve = real
  }
  assert(handler, "highmast-mcp did not call Deno.serve")
  return handler!
}

const URL_FN = "https://example.supabase.co/functions/v1/highmast-mcp"
const rpc = (method: string, params: unknown, id = 1, key: string | null = KEY) =>
  new Request(URL_FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  })

function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
  return JSON.parse(atob(part + "===".slice((part.length + 3) % 4)))
}

const opts = { sanitizeOps: false, sanitizeResources: false }
const realFetch = globalThis.fetch

async function withFakeDb<T>(fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = fakeFetch as typeof fetch
  calls.length = 0
  try {
    return await fn()
  } finally {
    globalThis.fetch = realFetch
  }
}

Deno.test({ name: "refuses no key, a malformed key and an unknown or revoked key", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = []
  const noKey = await h(rpc("tools/list", {}, 1, null))
  assertEquals(noKey.status, 401)
  assertEquals(calls.length, 0, "nothing reaches the database without a key")
  assertEquals((await h(rpc("tools/list", {}, 1, "hm_partner_api_key"))).status, 401)
  assertEquals(calls.length, 0, "a malformed key never reaches the database")
  const unknown = await h(rpc("tools/list", {}))
  assertEquals(unknown.status, 401)
  assertEquals(calls.length, 1, "only the key check ran")
  assertEquals(calls[0].url.pathname, "/rest/v1/rpc/rr_mcp_resolve_key")
  const sent = JSON.parse(calls[0].body)
  assertMatch(sent.p_key_hash, /^[0-9a-f]{64}$/, "only the hash of the key is sent")
  assertFalse(calls[0].body.includes(KEY), "the key itself is never sent to the database")
}) })

Deno.test({ name: "the 61st call in a minute gets 429 with Retry-After", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [{ ...MEMBER, allowed: false, retry_after_seconds: 17 }]
  const res = await h(rpc("tools/list", {}))
  assertEquals(res.status, 429)
  assertEquals(res.headers.get("Retry-After"), "17")
  assertEquals(calls.length, 1)
}) })

Deno.test({ name: "a good key lists exactly the agreed tools, none of them risky", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const init = await h(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }))
  assertEquals(init.status, 200)
  const initBody = await init.json()
  assertEquals(initBody.result.serverInfo.name, "highmast")

  const res = await h(rpc("tools/list", {}, 2))
  assertEquals(res.status, 200)
  const body = await res.json()
  const names = (body.result.tools as { name: string; inputSchema: unknown; annotations?: { destructiveHint?: boolean } }[])
  assertEquals(names.map((t) => t.name).sort(), EXPECTED_TOOLS)
  for (const t of names) {
    assertFalse(/delete|remove|hr|payroll|salary|iban|passport|secret|setting|user|payment/i.test(t.name), t.name)
    assertEquals(t.annotations?.destructiveHint, false, `${t.name} is marked non-destructive`)
    assert(t.inputSchema, `${t.name} has a typed input`)
  }
}) })

Deno.test({ name: "a tool call runs as the key's member (never the service key) and is audited with the key", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const res = await h(rpc("tools/call", { name: "list_deals", arguments: { pipeline: "company", limit: 50 } }, 3))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertFalse(body.result.isError, JSON.stringify(body))
  const out = JSON.parse(body.result.content[0].text)
  assertEquals(out.items[0].company_name, "Acme LLC")

  const data = calls.filter((c) => c.url.pathname !== "/rest/v1/rpc/rr_mcp_resolve_key")
  assert(data.length >= 2, "queried the database and wrote the audit log")
  for (const c of calls) {
    assertEquals(c.headers.get("apikey"), ENV.SUPABASE_ANON_KEY, `${c.url.pathname} uses the public key`)
    assertFalse((c.headers.get("Authorization") || "").includes(ENV.SUPABASE_SERVICE_ROLE_KEY), `${c.url.pathname} never sends the service key`)
  }
  for (const c of data) {
    const claims = decodeJwt((c.headers.get("Authorization") || "").replace(/^Bearer /, ""))
    assertEquals(claims.role, "authenticated")
    assertEquals(claims.sub, MEMBER.auth_user_id, "acts as the key's member")
    assertEquals(claims.hm_mcp_key, MEMBER.key_id, "carries the AI key claim the database checks")
    assert(Number(claims.exp) - Number(claims.iat) <= 300, "short-lived token")
  }
  const crm = data.find((c) => c.url.pathname === "/rest/v1/crm")!
  assertEquals(crm.method, "GET")
  assert(Number(crm.url.searchParams.get("limit")) <= 51, "at most 50 rows (plus one to see if there is more)")

  const audit = data.find((c) => c.url.pathname === "/rest/v1/rpc/rr_mcp_log_call")
  assert(audit, "the call is written to the audit log")
  const logged = JSON.parse(audit!.body)
  assertEquals(logged.p_tool, "list_deals")
  assertEquals(logged.p_ok, true)
  assertEquals(logged.p_args.pipeline, "company")
  assert(calls.every((c) => c.method !== "DELETE"), "nothing is deleted")
}) })

Deno.test({ name: "a page larger than 50 is refused", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const body = await (await h(rpc("tools/call", { name: "list_deals", arguments: { pipeline: "company", limit: 500 } }, 6))).json()
  assert(body.result.isError)
  assertMatch(body.result.content[0].text, /less than or equal to 50/)
}) })

Deno.test({ name: "move_deal_stage refuses won and lost before writing anything, and logs the refusal", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const res = await h(rpc("tools/call", { name: "move_deal_stage", arguments: { deal_id: "44444444-4444-4444-8444-444444444444", stage: "Won", pipeline: "company" } }, 4))
  const body = await res.json()
  assert(body.result.isError)
  assertMatch(body.result.content[0].text, /not allowed/)
  assert(calls.every((c) => c.method === "GET" || c.url.pathname.startsWith("/rest/v1/rpc/")), "no write happened")
  const audit = calls.find((c) => c.url.pathname === "/rest/v1/rpc/rr_mcp_log_call")
  assertEquals(JSON.parse(audit!.body).p_ok, false)
}) })

Deno.test({ name: "an unknown tool is refused", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const res = await h(rpc("tools/call", { name: "delete_account", arguments: { id: "x" } }, 5))
  const body = await res.json()
  assert(body.error || body.result?.isError, "delete_account does not exist")
}) })
