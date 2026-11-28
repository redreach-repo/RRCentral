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
  // Overdue invoice chasing: aging, chase notes, chase tasks (never sends, never changes invoices).
  "list_invoice_aging", "add_invoice_chase_note", "complete_invoice_chase_task",
  // Quote notes (append-only; revise and extend are admin tools).
  "add_quote_note",
  // Quote follow-up chasing: waiting quotes, follow-up notes, follow-up tasks (never sends, never changes quotes).
  "list_quote_followups", "add_quote_chase_note", "complete_quote_chase_task",
  // Read-only PDF tools (tools_pdf.ts): every key, limited by what its member can see.
  "get_delivery_note_pdf", "get_invoice_pdf", "get_quote_pdf",
].sort()

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
// What rr_mcp_reach answers for a key with departments (null = the function is not there yet).
let reachBody: unknown = null
// What the Vercel PDF renderer answers (services/render-pdf).
let renderAnswer: () => Response = () => json({ ok: true, path: "quotes/RR-01-26007.pdf", size_bytes: 48213 })

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

const CHASE_INVOICES = [
  ["102", "Mass Allied Freighters", "2026-09-01", 37500],
  ["104", "Mass Allied Freighters", "2026-09-15", 37500],
  ["105", "Mass Allied Freighters", "2026-09-15", 37500],
  ["103", "Arabian Sky Business Center", "2026-09-30", 1732.5],
].map(([n, client, date, amount]) => ({
  id: `88888888-8888-4888-8888-000000000${n}`,
  client,
  reference_number: `RR-03-26${n}`,
  date,
  amount,
  currency: "AED",
  status: "Sent",
  payment_status: "Pending",
  payment_terms: "Net 30",
  deleted_at: null,
}))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

async function fakeFetch(input: Request | URL | string, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init)
  const url = new URL(req.url)
  calls.push({ url, method: req.method, headers: req.headers, body: req.method === "GET" ? "" : await req.text() })
  if (url.pathname === "/rest/v1/rpc/rr_mcp_resolve_key") return json(resolveRows)
  if (url.pathname === "/rest/v1/rpc/rr_mcp_log_call") return new Response(null, { status: 204 })
  if (url.pathname === "/rest/v1/rpc/rr_mcp_reach") {
    return reachBody ? json(reachBody) : json({ code: "PGRST202", message: "Could not find the function public.rr_mcp_reach in the schema cache" }, 404)
  }
  if (url.pathname === "/rest/v1/crm") {
    return json([{ id: "44444444-4444-4444-8444-444444444444", company_name: "Acme LLC", pipeline_stage: "Lead", owner: "Sara", updated_at: "2026-11-01T00:00:00Z" }])
  }
  if (url.pathname === "/rest/v1/quotations" && url.searchParams.get("reference_number") === "eq.RR-01-26007") {
    return json([{ id: "66666666-6666-4666-8666-666666666666", quote_id: "Q-1", reference_number: "RR-01-26007", status: "Sent", updated_at: "2026-11-01T00:00:00Z", deleted_at: null }])
  }
  if (url.pathname === "/rest/v1/quotations" && url.searchParams.get("reference_number") === "eq.RR-01-26008") {
    return json([{ id: "77777777-7777-4777-8777-777777777777", quote_id: "Q-2", reference_number: "RR-01-26008", status: "Draft", deleted_at: "2026-11-02T00:00:00Z" }])
  }
  if (url.pathname === "/storage/v1/object/list/generated-pdfs") {
    const body = JSON.parse(calls[calls.length - 1].body || "{}")
    return json(body.search === "RR-01-26007.pdf"
      ? [{ name: "RR-01-26007.pdf", updated_at: "2026-11-05T10:00:00Z", metadata: { size: 48213 } }]
      : [])
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/generated-pdfs/")) {
    return json({ signedURL: "/object/sign/generated-pdfs/quotes/RR-01-26007.pdf?token=t" })
  }
  if (url.host === "render.test") return renderAnswer()
  // Overdue invoice chasing: the brief's four overdue invoices (AED 114,232.50).
  if (url.pathname === "/rest/v1/invoices" && req.method === "GET") {
    const all = CHASE_INVOICES.filter((i) => !url.searchParams.get("reference_number") || `eq.${i.reference_number}` === url.searchParams.get("reference_number"))
    return json(all)
  }
  if (url.pathname === "/rest/v1/invoice_chase_log" && req.method === "GET") {
    return json([{ id: "c1", invoice_id: "88888888-8888-4888-8888-000000000102", chased_on: "2026-11-10", channel: "call", contact: "Accounts", note: "Will pay", promised_date: "2026-11-20", created_by_email: "s@x", created_at: "2026-11-10T09:00:00Z", deleted_at: null }])
  }
  if (url.pathname === "/rest/v1/invoice_chase_log" && req.method === "POST") {
    const row = JSON.parse(calls[calls.length - 1].body)
    return json({ id: "c2", chased_on: row.chased_on, promised_date: row.promised_date })
  }
  // Quote follow-up chasing: Sharjah ReadyMix RR-01-26007 has client PO 4200050362 but still shows Sent.
  if (url.pathname === "/rest/v1/quotations" && req.method === "GET" && (url.searchParams.get("status") || "").startsWith("in.")) {
    return json([
      { id: "66666666-6666-4666-8666-666666666666", client: "Sharjah ReadyMix Concrete", reference_number: "RR-01-26007", division_code: "01", amount: 18900, quotation_currency: "AED", status: "Sent", sent_at: "2026-10-20T09:00:00Z", valid_until: "2099-12-31", deleted_at: null },
      { id: "99999999-9999-4999-8999-000000000010", client: "Fresh Co", reference_number: "RR-03-26010", division_code: "03", amount: 5000, quotation_currency: "AED", status: "Sent", sent_at: "2026-11-01T09:00:00Z", valid_until: "2099-12-31", deleted_at: null },
    ])
  }
  if (url.pathname === "/rest/v1/client_purchase_orders" && req.method === "GET") {
    return json([{ id: "p1", po_number: "4200050362", quotation_id: "66666666-6666-4666-8666-666666666666", quote_reference: "RR-01-26007", status: "open", issued_on: "2026-11-10" }])
  }
  if (url.pathname === "/rest/v1/quote_chase_log" && req.method === "POST") {
    const row = JSON.parse(calls[calls.length - 1].body)
    return json({ id: "qc1", chased_on: row.chased_on, response: row.response, next_follow_up: row.next_follow_up })
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

Deno.test({ name: "dashboard_summary shows receivables aging, broken promises and the next chase action", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const body = await (await h(rpc("tools/call", { name: "dashboard_summary", arguments: {} }, 31))).json()
  assertFalse(body.result.isError, JSON.stringify(body))
  const out = JSON.parse(body.result.content[0].text)
  const aging = out.receivables_aging
  assertEquals(aging.totals_by_currency.AED.overdue, 114232.5)
  assertEquals(aging.totals_by_currency.AED.count, 4)
  assertEquals(aging.broken_promises.map((p: { reference: string }) => p.reference), ["RR-03-26102"])
  assertEquals(aging.next_chase_actions.length, 4)
  for (const a of aging.next_chase_actions) assert(a.next_action, `${a.reference} has a next action`)
  assert(calls.every((c) => c.method === "GET" || c.url.pathname.startsWith("/rest/v1/rpc/")), "the summary writes nothing")
}) })

Deno.test({ name: "add_invoice_chase_note logs a chase and never touches the invoice or sends anything", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const body = await (await h(rpc("tools/call", {
    name: "add_invoice_chase_note",
    arguments: { reference: "RR-03-26104", channel: "call", contact: "Ravi", note: "Cheque next week", promised_date: "2099-01-05" },
  }, 32))).json()
  assertFalse(body.result.isError, JSON.stringify(body))
  const out = JSON.parse(body.result.content[0].text)
  assertEquals(out.reference, "RR-03-26104")
  const writes = calls.filter((c) => c.method !== "GET" && !c.url.pathname.startsWith("/rest/v1/rpc/"))
  assertEquals(writes.map((c) => c.url.pathname), ["/rest/v1/invoice_chase_log"], "only the chase log is written")
  const sent = JSON.parse(writes[0].body)
  assertEquals(sent.invoice_id, "88888888-8888-4888-8888-000000000104")
  assertEquals(sent.channel, "call")
  assertFalse("created_by" in sent || "created_by_email" in sent || "tenant_id" in sent, "who and tenant come from the database")
  assert(calls.every((c) => !/zoho|whatsapp|graph\.facebook|mail/i.test(c.url.host)), "nothing is sent to anyone")

  const bad = await (await h(rpc("tools/call", { name: "add_invoice_chase_note", arguments: { reference: "RR-03-26104", channel: "fax", note: "x" } }, 33))).json()
  assert(bad.result.isError)
  const future = await (await h(rpc("tools/call", { name: "add_invoice_chase_note", arguments: { reference: "RR-03-26104", channel: "call", note: "x", chased_on: "2099-01-01" } }, 34))).json()
  assert(future.result.isError)
  assertMatch(future.result.content[0].text, /future/)
}) })

Deno.test({ name: "dashboard_summary and list_quote_followups show quotes waiting, with a client PO not yet awarded first", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const body = await (await h(rpc("tools/call", { name: "dashboard_summary", arguments: {} }, 41))).json()
  assertFalse(body.result.isError, JSON.stringify(body))
  const q = JSON.parse(body.result.content[0].text).quote_followups
  assertEquals(q.waiting, 2)
  assertEquals(q.totals_by_currency.AED.total, 23900)
  assertEquals(q.po_not_awarded.map((p: { reference: string; po_number: string }) => `${p.reference} ${p.po_number}`), ["RR-01-26007 4200050362"])
  assertEquals(q.next_actions[0].reference, "RR-01-26007")
  assertMatch(q.next_actions[0].next_action, /mark the quote Awarded/)
  assert(calls.every((c) => c.method === "GET" || c.url.pathname.startsWith("/rest/v1/rpc/")), "the summary writes nothing")

  const list = await (await h(rpc("tools/call", { name: "list_quote_followups", arguments: { state: "decide" } }, 42))).json()
  assertFalse(list.result.isError, JSON.stringify(list))
  const out = JSON.parse(list.result.content[0].text)
  assertEquals(out.needs_decision, 1)
  assertEquals(out.client_pos_visible, true)
}) })

Deno.test({ name: "add_quote_chase_note logs a follow-up only for sent quotes and never touches the quote or sends anything", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const body = await (await h(rpc("tools/call", {
    name: "add_quote_chase_note",
    arguments: { reference: "RR-01-26007", channel: "whatsapp", contact: "Vishraj", note: "PO is with accounts", response: "interested", next_follow_up: "2099-01-05" },
  }, 43))).json()
  assertFalse(body.result.isError, JSON.stringify(body))
  const out = JSON.parse(body.result.content[0].text)
  assertEquals(out.reference, "RR-01-26007")
  const writes = calls.filter((c) => c.method !== "GET" && !c.url.pathname.startsWith("/rest/v1/rpc/"))
  assertEquals(writes.map((c) => c.url.pathname), ["/rest/v1/quote_chase_log"], "only the follow-up log is written")
  const sent = JSON.parse(writes[0].body)
  assertEquals(sent.quotation_id, "66666666-6666-4666-8666-666666666666")
  assertEquals(sent.response, "interested")
  assertFalse("created_by" in sent || "created_by_email" in sent || "tenant_id" in sent, "who and tenant come from the database")
  assert(calls.every((c) => !/zoho|whatsapp|graph\.facebook|mail/i.test(c.url.host)), "nothing is sent to anyone")

  const draft = await (await h(rpc("tools/call", { name: "add_quote_chase_note", arguments: { reference: "RR-01-26008", channel: "call", note: "x" } }, 44))).json()
  assert(draft.result.isError)
  assertMatch(draft.result.content[0].text, /only sent quotes/)
  const empty = await (await h(rpc("tools/call", { name: "add_quote_chase_note", arguments: { reference: "RR-01-26007", channel: "call" } }, 45))).json()
  assert(empty.result.isError)
  const bad = await (await h(rpc("tools/call", { name: "add_quote_chase_note", arguments: { reference: "RR-01-26007", channel: "call", response: "maybe" } }, 46))).json()
  assert(bad.result.isError)
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

// ---- Admin scope (tools_admin.ts) --------------------------------------------
// Every admin tool against a real database: highmast_mcp_admin_db_test.ts.

const ADMIN_MEMBER = {
  ...MEMBER, key_name: "AI Assistant", role: "admin", scope: "admin", assistant: "claude", departments: ["admin"],
  member_name: "AI Assistant", member_email: "ai-assistant@redreach.ae",
}

/** The reach the database gives a key: every table of the listed areas (a stand-in for rr_mcp_table_departments). */
async function reachFor(departments: string[]) {
  const { ENTITIES } = await import(new URL(FN + "tools_admin.ts", ROOT).href)
  const areas: Record<string, string[]> = {
    sales: ["CRM", "Client accounts", "Quotations"],
    hr: ["HR"],
    payroll: ["Payroll"],
  }
  const want = new Set(departments.flatMap((d) => areas[d] || []))
  const tables = Object.values(ENTITIES as Record<string, { table: string; area: string }>)
    .filter((e) => departments.includes("admin") || want.has(e.area)).map((e) => e.table)
  if (departments.includes("payroll")) tables.push("hr_employees")
  return { departments, read: tables, write: tables.filter((t) => !(departments.includes("payroll") && t === "hr_employees")) }
}

Deno.test("admin tools write only through the audited database functions, never delete, never use the service key", async () => {
  const src = await read(FN + "tools_admin.ts")
  assertFalse(/\.delete\(/.test(src), "tools_admin.ts calls .delete(")
  assertFalse(/\.(insert|update|upsert)\(/.test(src), "tools_admin.ts writes a table directly instead of through rr_mcp_* functions")
  assertFalse(/SERVICE_ROLE/.test(src))
  assertFalse(/rr_hr_leave_decide|approved_by|status:\s*"approved"|"paid"/.test(src), "nothing approves leave or payroll or marks payroll paid")
  assert(/if \(ctx\.key\.scope !== "admin"\) return/.test(src), "admin tools are only registered for admin keys")
})

Deno.test("the admin tool list is exactly the agreed one and no name approves, pays out or touches secrets", async () => {
  const { MCP_ADMIN_TOOLS, adminToolNameProblem } = await import(new URL(FN + "highmastMcp.bundle.js", ROOT).href)
  const { ADMIN_TOOLS } = await import(new URL(FN + "tools_admin.ts", ROOT).href)
  assertEquals(ADMIN_TOOLS.map((t: { name: string }) => t.name).sort(), [...MCP_ADMIN_TOOLS].sort())
  for (const n of MCP_ADMIN_TOOLS) assertEquals(adminToolNameProblem(n), null, n)
  assertEquals(adminToolNameProblem("approve_payroll_run"), 'admin tool "approve_payroll_run" touches "approve"')
})

Deno.test({ name: "a standard key never sees the admin tools; an admin key sees both sets", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const std = (await (await h(rpc("tools/list", {}, 7))).json()).result.tools.map((t: { name: string }) => t.name).sort()
  assertEquals(std, EXPECTED_TOOLS)
  resolveRows = [{ ...ADMIN_MEMBER, scope: "standard" }]
  const odd = (await (await h(rpc("tools/list", {}, 8))).json()).result.tools.map((t: { name: string }) => t.name).sort()
  assertEquals(odd, EXPECTED_TOOLS, "an admin role without the admin scope gets the standard tools")
  resolveRows = [ADMIN_MEMBER]
  reachBody = await reachFor(["admin"])
  const tools = (await (await h(rpc("tools/list", {}, 9))).json()).result.tools as { name: string; annotations?: { destructiveHint?: boolean } }[]
  const names = tools.map((t) => t.name)
  for (const n of EXPECTED_TOOLS) assert(names.includes(n), `admin key keeps ${n}`)
  for (const n of ["create_quote", "record_payment", "create_credit_note", "delete_record", "restore_record", "create_payroll_run", "list_users"]) {
    assert(names.includes(n), `admin key has ${n}`)
  }
  assertFalse(names.some((n) => /approve|pay_run|payout|setting|secret|password/.test(n)))
  for (const t of tools) assertEquals(t.annotations?.destructiveHint, false, `${t.name}: nothing is erased`)
  reachBody = null
}) })

Deno.test({ name: "a key with departments sees only its departments' tools and records", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  const { toolsForDepartments } = await import(new URL(FN + "highmastMcp.bundle.js", ROOT).href)
  type Tool = { name: string; inputSchema: { properties?: Record<string, { enum?: string[] }> } }
  const list = async (departments: string[], id: number) => {
    resolveRows = [{ ...ADMIN_MEMBER, key_name: `Key ${departments.join("+")}`, departments }]
    reachBody = await reachFor(departments)
    const body = await (await h(rpc("tools/list", {}, id))).json()
    return body.result.tools as Tool[]
  }
  try {
    const sales = await list(["sales"], 20)
    const salesNames = sales.map((t) => t.name).sort()
    assertEquals(salesNames, [...toolsForDepartments(["sales"])].sort(), "sales gets exactly the sales tools")
    for (const n of ["create_quote", "create_deal", "close_deal", "search_accounts", "list_records"]) assert(salesNames.includes(n), `sales has ${n}`)
    for (const n of ["record_payment", "update_employee", "create_payroll_run", "reply_ticket", "list_users"]) assertFalse(salesNames.includes(n), `sales has no ${n}`)
    const entities = sales.find((t) => t.name === "list_records")!.inputSchema.properties!.entity.enum!
    assert(entities.includes("accounts") && entities.includes("quotes"), "sales lists accounts and quotes")
    assertFalse(entities.includes("employees") || entities.includes("payroll_runs") || entities.includes("users"), "but not HR, payroll or users")

    const hr = (await list(["hr"], 21)).map((t) => t.name)
    for (const n of ["list_employees", "update_employee", "create_leave_request"]) assert(hr.includes(n), `hr has ${n}`)
    for (const n of ["create_quote", "create_payroll_run", "search_accounts", "create_lead"]) assertFalse(hr.includes(n), `hr has no ${n}`)

    const payroll = await list(["payroll"], 22)
    const payrollNames = payroll.map((t) => t.name)
    for (const n of ["create_payroll_run", "get_payroll_run", "get_employee"]) assert(payrollNames.includes(n), `payroll has ${n}`)
    assertFalse(payrollNames.includes("update_employee"), "payroll cannot change employees")
    const payrollCreate = payroll.find((t) => t.name === "create_record")?.inputSchema.properties?.entity.enum || []
    assertFalse(payrollCreate.includes("employees"), "nor through create_record")

    // A tool outside the key's departments is refused even if called by name.
    resolveRows = [{ ...ADMIN_MEMBER, departments: ["hr"] }]
    reachBody = await reachFor(["hr"])
    const res = await (await h(rpc("tools/call", { name: "create_quote", arguments: {} }, 23))).json()
    assert(res.error || res.result?.isError, "create_quote is not there for an HR key")
    assertFalse(calls.some((c) => c.url.pathname === "/rest/v1/rpc/rr_mcp_quote_save"), "nothing reached the database")
  } finally {
    reachBody = null
  }
}) })

Deno.test({ name: "an admin write goes through rr_mcp_save as the AI Assistant, and sensitive arguments are hidden in the call log", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [ADMIN_MEMBER]
  const res = await h(rpc("tools/call", {
    name: "update_employee",
    arguments: { employee_id: "55555555-5555-4555-8555-555555555555", job_title: "Designer", iban: "AE070331234567890123456", basic_salary_aed: 9000 },
  }, 10))
  assertEquals(res.status, 200)
  const save = calls.find((c) => c.url.pathname === "/rest/v1/rpc/rr_mcp_save")
  assert(save, "the write went through rr_mcp_save")
  const sent = JSON.parse(save!.body)
  assertEquals(sent.p_table, "hr_employees")
  assertEquals(sent.p_data.job_title, "Designer")
  const claims = decodeJwt((save!.headers.get("Authorization") || "").replace(/^Bearer /, ""))
  assertEquals(claims.sub, ADMIN_MEMBER.auth_user_id)
  const log = JSON.parse(calls.find((c) => c.url.pathname === "/rest/v1/rpc/rr_mcp_log_call")!.body)
  assertEquals(log.p_args.iban, "[hidden]")
  assertEquals(log.p_args.basic_salary_aed, "[hidden]")
  assert(calls.every((c) => c.method !== "DELETE" && c.method !== "PATCH"), "no direct table writes")
}) })

Deno.test({ name: "get_quote_pdf returns a 1 hour signed link to the saved Download PDF, and refuses deleted or unknown quotes", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  resolveRows = [MEMBER]
  const names = (await (await h(rpc("tools/list", {}, 30))).json()).result.tools.map((t: { name: string }) => t.name)
  for (const n of ["get_quote_pdf", "get_invoice_pdf", "get_delivery_note_pdf"]) assert(names.includes(n), `standard key has ${n}`)
  const call = async (args: Record<string, unknown>, id: number) => {
    const body = await (await h(rpc("tools/call", { name: "get_quote_pdf", arguments: args }, id))).json()
    return { isError: !!body.result?.isError, out: JSON.parse(body.result.content[0].text) }
  }
  const ok = await call({ quote_number: "RR-01-26007" }, 31)
  assertFalse(ok.isError, JSON.stringify(ok.out))
  assertEquals(ok.out.file_name, "RR-01-26007.pdf")
  assertEquals(ok.out.size_bytes, 48213)
  assertEquals(ok.out.generated_at, "2026-11-05T10:00:00Z")
  assertEquals(ok.out.expires_in_seconds, 3600)
  assertMatch(ok.out.signed_url, /^http:\/\/db\.test\/storage\/v1\/object\/sign\/generated-pdfs\/quotes\/RR-01-26007\.pdf\?token=/)
  const sign = calls.find((c) => c.url.pathname.startsWith("/storage/v1/object/sign/"))!
  assertEquals(JSON.parse(sign.body).expiresIn, 3600)
  const claims = decodeJwt((sign.headers.get("Authorization") || "").replace(/^Bearer /, ""))
  assertEquals(claims.hm_mcp_key, MEMBER.key_id, "the link is made as the key's member, never the service key")
  assert(calls.every((c) => !["DELETE", "PATCH", "PUT"].includes(c.method)), "nothing is changed")
  assertFalse(calls.some((c) => /\/rest\/v1\/(quotations|invoices)/.test(c.url.pathname) && c.method !== "GET"), "the quote is only read")
  assert(calls.some((c) => c.url.pathname === "/rest/v1/rpc/rr_mcp_log_call"), "the call is audited")

  const deleted = await call({ quote_number: "RR-01-26008" }, 32)
  assert(deleted.isError)
  assertMatch(deleted.out.error, /is deleted/)
  const missing = await call({ quote_number: "RR-01-26999" }, 33)
  assert(missing.isError)
  assertMatch(missing.out.error, /No quote RR-01-26999/)
  const none = await call({}, 34)
  assert(none.isError)
  assertMatch(none.out.error, /quote_id or quote_number/)
}) })

Deno.test({ name: "with the renderer set up, get_quote_pdf has the app render a fresh PDF with a 2 minute read-only render login", ...opts, fn: () => withFakeDb(async () => {
  const h = await load()
  const pdf = await import(new URL(FN + "tools_pdf.ts", ROOT).href)
  pdf.setPdfRenderer(pdf.httpRenderer("https://render.test/api/render", { jwtSecret: ENV.MCP_JWT_SECRET, anonKey: ENV.SUPABASE_ANON_KEY }))
  try {
    resolveRows = [MEMBER]
    const call = async (id: number) => {
      const body = await (await h(rpc("tools/call", { name: "get_quote_pdf", arguments: { quote_number: "RR-01-26007" } }, id))).json()
      return { isError: !!body.result?.isError, out: JSON.parse(body.result.content[0].text) }
    }
    const ok = await call(41)
    assertFalse(ok.isError, JSON.stringify(ok.out))
    assertMatch(ok.out.source, /rendered now/)
    assertEquals(ok.out.warning, undefined)
    const r = calls.find((c) => c.url.host === "render.test")!
    const sent = JSON.parse(r.body)
    assertEquals(sent.kind, "quote")
    assertEquals(sent.id, "66666666-6666-4666-8666-666666666666")
    assertEquals(sent.apikey, ENV.SUPABASE_ANON_KEY)
    const claims = decodeJwt(sent.token)
    assertEquals(claims.hm_pdf_render, "quote:66666666-6666-4666-8666-666666666666")
    assertEquals(claims.hm_mcp_key, MEMBER.key_id, "the render login is still the key's AI session")
    assertEquals(Number(claims.exp) - Number(claims.iat), 120)
    assertFalse(JSON.stringify(sent).includes(ENV.MCP_JWT_SECRET), "the signing secret never leaves")

    // Renderer down: the saved copy comes back, with a clear warning.
    renderAnswer = () => json({ ok: false, error: "Render failed: timeout" }, 502)
    const fallback = await call(42)
    assertFalse(fallback.isError)
    assertMatch(fallback.out.source, /saved by the app/)
    assertMatch(fallback.out.warning, /could not make the PDF: Render failed: timeout.*copy saved at the last Download PDF/)
  } finally {
    pdf.setPdfRenderer(null)
    renderAnswer = () => json({ ok: true, path: "quotes/RR-01-26007.pdf", size_bytes: 48213 })
  }
}) })

Deno.test("MCP session JWT carries kid only when MCP_JWT_KID is given", async () => {
  const { signJwt } = await import("../../functions/highmast-mcp/auth.ts")
  const head = (t: string) => JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")))
  const plain = await signJwt({ sub: "x" }, "secret")
  const withKid = await signJwt({ sub: "x" }, "secret", "key-1")
  if (head(plain).kid !== undefined) throw new Error("no kid expected")
  if (head(withKid).kid !== "key-1" || head(withKid).alg !== "HS256") throw new Error("kid expected")
})
