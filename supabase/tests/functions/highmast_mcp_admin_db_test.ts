// HighMast MCP admin tools, end to end against a real database.
//
// Runs EVERY admin tool through the same runTool the server uses, as an AI
// session with an admin key, on test records in a local Postgres that has all
// migrations applied (row level security, guards and audit included). It all
// happens in one transaction that is rolled back at the end, so the test
// records are cleaned up.
//
// Needs a database built by supabase/tests/run.sh (or the same migrations):
//   RR_TEST_PG_DB=rr_rls_test PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres \
//     deno test -A supabase/tests/functions/highmast_mcp_admin_db_test.ts
// Without RR_TEST_PG_DB the test is skipped (CI has no database for Deno tests).
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1"
import postgres from "npm:postgres@3.4.5"
import { ADMIN_TOOLS, ENTITIES } from "../../functions/highmast-mcp/tools_admin.ts"
import { MCP_DEPARTMENT_VALUES, MCP_TOOL_DEPARTMENTS } from "../../functions/highmast-mcp/highmastMcp.bundle.js"
import { runTool, TOOLS, type ToolContext } from "../../functions/highmast-mcp/tools.ts"

const DB = Deno.env.get("RR_TEST_PG_DB") || ""

type Row = Record<string, unknown>
type Res = { data: unknown; error: { message: string; code: string } | null }
// deno-lint-ignore no-explicit-any
type Sql = any

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "null"
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`)
  return `"${s}"`
}

/** Just enough of supabase-js (from / select / filters / rpc) to run the tools on Postgres. */
class FakeDb {
  n = 0
  constructor(private sql: Sql) {}
  async run(text: string): Promise<Res> {
    const sp = `s${++this.n}`
    await this.sql.unsafe(`savepoint ${sp}`)
    try {
      const rows = await this.sql.unsafe(text)
      await this.sql.unsafe(`release savepoint ${sp}`)
      return { data: rows[0]?.out ?? null, error: null }
    } catch (e) {
      await this.sql.unsafe(`rollback to savepoint ${sp}`)
      const err = e as { message?: string; code?: string }
      return { data: null, error: { message: err.message || String(e), code: err.code || "" } }
    }
  }
  from(table: string) {
    return new Query(this, table)
  }
  async rpc(fn: string, args: Row): Promise<Res> {
    const info = await this.sql.unsafe(
      `select p.proretset as set, t.typname as type, t.typtype as kind from pg_proc p join pg_type t on t.oid = p.prorettype
       where p.proname = ${lit(fn)} and p.pronamespace = 'public'::regnamespace limit 1`,
    )
    if (!info.length) return { data: null, error: { message: `function ${fn} does not exist`, code: "42883" } }
    const call = `public.${ident(fn)}(${Object.entries(args).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(", ")})`
    const { set, type, kind } = info[0]
    if (type === "void") return this.run(`select null::jsonb as out from (select ${call}) x`)
    if (set || kind === "c") {
      const res = await this.run(`select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as out from ${call} r`)
      if (!res.error && !set) res.data = (res.data as unknown[])[0] ?? null
      return res
    }
    return this.run(`select to_jsonb(${call}) as out`)
  }
}

class Query implements PromiseLike<Res> {
  private cols = "*"
  private where: string[] = []
  private orders: string[] = []
  private lim: number | null = null
  private off = 0
  private one: "" | "maybe" | "single" = ""
  constructor(private db: FakeDb, private table: string) {}
  select(cols = "*") { this.cols = cols; return this }
  eq(c: string, v: unknown) { this.where.push(`${ident(c)} = ${lit(v)}`); return this }
  is(c: string, v: unknown) { this.where.push(`${ident(c)} is ${v === null ? "null" : v ? "true" : "false"}`); return this }
  ilike(c: string, v: string) { this.where.push(`${ident(c)} ilike ${lit(v)}`); return this }
  in(c: string, vs: unknown[]) { this.where.push(vs.length ? `${ident(c)} in (${vs.map(lit).join(", ")})` : "false"); return this }
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const [c, op, ...rest] = p.split(".")
      if (op !== "ilike") throw new Error(`fake or() supports ilike only: ${p}`)
      return `${ident(c)} ilike ${lit(rest.join("."))}`
    })
    this.where.push(`(${parts.join(" or ")})`)
    return this
  }
  order(c: string, o: { ascending?: boolean } = {}) { this.orders.push(`${ident(c)} ${o.ascending === false ? "desc" : "asc"} nulls last`); return this }
  range(a: number, b: number) { this.off = a; this.lim = b - a + 1; return this }
  limit(n: number) { this.lim = n; return this }
  maybeSingle() { this.one = "maybe"; return this }
  single() { this.one = "single"; return this }
  then<A, B>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.exec().then(ok, bad)
  }
  private async exec(): Promise<Res> {
    const cols = this.cols === "*" ? "*" : this.cols.split(",").map((c) => ident(c.trim())).join(", ")
    const inner = `select ${cols} from public.${ident(this.table)}` +
      (this.where.length ? ` where ${this.where.join(" and ")}` : "") +
      (this.orders.length ? ` order by ${this.orders.join(", ")}` : "") +
      (this.lim != null ? ` limit ${this.lim}` : "") + (this.off ? ` offset ${this.off}` : "")
    const res = await this.db.run(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as out from (${inner}) t`)
    if (res.error || !this.one) return res
    const rows = res.data as Row[]
    if (this.one === "single" && rows.length !== 1) return { data: null, error: { message: "not exactly one row", code: "PGRST116" } }
    return { data: rows[0] ?? null, error: null }
  }
}

// "admin": one key with the admin department runs everything.
// "departments": each tool runs with a key that has only that tool's department,
// proving every tool works inside its department's reach (and nowhere else).
for (const mode of ["admin", "departments"] as const)
Deno.test({
  name: mode === "admin"
    ? "every admin tool works end to end on a real database (rolled back)"
    : "every tool works with a key that has only its own department (rolled back)",
  ignore: !DB,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const pg = postgres({
      host: Deno.env.get("PGHOST") || "localhost",
      user: Deno.env.get("PGUSER") || "postgres",
      password: Deno.env.get("PGPASSWORD") || "postgres",
      database: DB,
      max: 1,
      onnotice: () => {},
    })
    const used = new Set<string>()
    try {
      await pg.begin(async (sql: Sql) => {
        // Fixtures (as the database owner): the AI Assistant member, an admin key, an employee.
        await sql.unsafe(`
          insert into auth.users values ('00000000-0000-0000-0000-0000000001c1', 'ai-assistant@redreach.ae', now()) on conflict (id) do nothing;
          insert into public.app_users (email, name, role, active, tenant_id)
          values ('ai-assistant@redreach.ae', 'AI Assistant', 'admin', true, 'a0000000-0000-4000-8000-000000000001')
          on conflict (email) do update set role = 'admin', active = true;
          insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, departments, acts_as_user_id, created_by)
          select 'e7900000-0000-4000-8000-000000000001', 'AI Assistant', 'hmk_test', repeat('3', 64), 'admin', 'admin', '{admin}', u.id, 'test'
          from public.app_users u where u.email = 'ai-assistant@redreach.ae' on conflict (id) do nothing;
        `)
        // One key per department (the "departments" mode switches between them).
        const deptKeys: Record<string, string> = {}
        MCP_DEPARTMENT_VALUES.forEach((d: string, i: number) => {
          deptKeys[d] = `e7900000-0000-4000-8000-0000000000${(16 + i).toString(16)}`
        })
        for (const [d, id] of Object.entries(deptKeys)) {
          await sql.unsafe(`
            insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, assistant, departments, acts_as_user_id, created_by)
            select '${id}', 'Dept ${d}', 'hmk_dpt', md5('${d}') || md5('${d}x'), 'admin', 'admin', 'grok', '{${d}}', u.id, 'test'
            from public.app_users u where u.email = 'ai-assistant@redreach.ae' on conflict (id) do nothing;
          `)
        }
        const member = (await sql.unsafe(`select id from public.app_users where email = 'ai-assistant@redreach.ae'`))[0].id as string
        // From here on: an AI session with the admin key, exactly as the function's login token gives.
        await sql.unsafe(`
          select set_config('role', 'authenticated', true);
          select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001c1', true);
          select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001c1","role":"authenticated","hm_mcp_key":"e7900000-0000-4000-8000-000000000001"}', true);
        `)
        const db = new FakeDb(sql)
        const ctx = {
          db,
          key: {
            keyId: "e7900000-0000-4000-8000-000000000001", keyName: "AI Assistant", role: "admin", scope: "admin",
            memberId: member, memberName: "AI Assistant", memberEmail: "ai-assistant@redreach.ae", authUserId: "00000000-0000-0000-0000-0000000001c1",
          },
          now: () => new Date(),
        } as unknown as ToolContext

        const ADMIN_KEY = "e7900000-0000-4000-8000-000000000001"
        async function useKey(keyId: string, departments: string[]) {
          await sql.unsafe(`select set_config('request.jwt.claims', ${lit(JSON.stringify({
            sub: "00000000-0000-0000-0000-0000000001c1", role: "authenticated", hm_mcp_key: keyId,
          }))}, true)`)
          const r = (await sql.unsafe(`select public.rr_mcp_reach() as r`))[0].r as { read: string[]; write: string[] }
          const c = ctx as unknown as { key: Row; reach?: unknown }
          c.key = { ...c.key, keyId, departments }
          c.reach = { departments, read: new Set(r.read), write: new Set(r.write) }
        }
        // Reach of every department, from the database.
        const reachOf: Record<string, { read: string[]; write: string[] }> = {}
        for (const [d, id] of Object.entries(deptKeys)) {
          await useKey(id, [d])
          const c = ctx as unknown as { reach: { read: Set<string>; write: Set<string> } }
          reachOf[d] = { read: [...c.reach.read], write: [...c.reach.write] }
        }
        await useKey(ADMIN_KEY, ["admin"])
        const GENERIC_WRITE = ["create_record", "update_record", "delete_record", "restore_record"]
        const ORDER = MCP_DEPARTMENT_VALUES.filter((d: string) => d !== "admin")
        /** The department a tool runs under in "departments" mode. */
        function deptFor(name: string, args: Row): string {
          if (name === "list_records" || name === "get_record" || GENERIC_WRITE.includes(name)) {
            const table = ENTITIES[String(args.entity)]?.table
            const write = GENERIC_WRITE.includes(name)
            return ORDER.find((d: string) => (write ? reachOf[d].write : reachOf[d].read).includes(table)) || "admin"
          }
          return ((MCP_TOOL_DEPARTMENTS as Record<string, string[]>)[name] || [])[0] || "admin"
        }
        async function keyFor(name: string, args: Row) {
          if (mode === "admin") return
          const d = deptFor(name, args)
          await useKey(d === "admin" ? ADMIN_KEY : deptKeys[d], [d])
        }

        const byName = new Map([...TOOLS, ...ADMIN_TOOLS].map((t) => [t.name, t]))
        async function call(name: string, args: Row): Promise<Row> {
          const def = byName.get(name)
          assert(def, `no tool ${name}`)
          used.add(name)
          await keyFor(name, args)
          const out = await runTool(def, args, ctx) as { isError?: boolean; content: { text: string }[] }
          const body = JSON.parse(out.content[0].text)
          if (out.isError) throw new Error(`${name} failed: ${body.error}`)
          return body
        }
        async function refused(name: string, args: Row, pattern: RegExp) {
          const def = byName.get(name)!
          used.add(name)
          await keyFor(name, args)
          const out = await runTool(def, args, ctx) as { isError?: boolean; content: { text: string }[] }
          assert(out.isError, `${name} should have been refused`)
          assertMatch(JSON.parse(out.content[0].text).error, pattern)
        }

        // CRM
        const acc = (await call("create_account", { name: "MCP E2E Trading LLC", type: "ai_crm_client", status: "prospect", country: "UAE" })).account as Row
        const accountId = String(acc.id)
        assertEquals((await call("update_account", { account_id: accountId, city: "Dubai" }) as Row & { account: Row }).account.city, "Dubai")
        const contact = (await call("create_contact", { account_id: accountId, name: "Sara Test", email: "sara@example.com" })).contact as Row
        await call("update_contact", { contact_id: contact.id, phone: "+971500000000" })
        const deal = (await call("create_deal", { pipeline: "ai_crm", data: { account_id: accountId, stage: "lead", next_action: "Call", next_action_date: "2026-12-01" } })).deal as Row
        await call("update_deal", { pipeline: "ai_crm", deal_id: deal.id, data: { notes: "Interested in package A" } })
        assertEquals(((await call("set_deal_stage", { pipeline: "ai_crm", deal_id: deal.id, stage: "quote_sent" })).deal as Row).stage, "quote_sent")
        assertEquals(((await call("set_deal_stage", { pipeline: "ai_crm", deal_id: deal.id, stage: "discovery_call" })).deal as Row).stage, "discovery_call")
        await refused("close_deal", { pipeline: "ai_crm", deal_id: deal.id, outcome: "lost" }, /lost_reason/)
        assertEquals(((await call("close_deal", { pipeline: "ai_crm", deal_id: deal.id, outcome: "lost", lost_reason: "Price", lost_note: "Too expensive" })).deal as Row).stage, "lost")
        const crmDeal = (await call("create_deal", { pipeline: "company", data: { company_name: "MCP E2E Trading LLC", pipeline_stage: "Lead", next_action: "Call", follow_up_date: "2026-12-01" } })).deal as Row
        assertEquals(((await call("close_deal", { pipeline: "company", deal_id: crmDeal.id, outcome: "won" })).deal as Row).pipeline_stage, "Won")
        await call("create_deal", { pipeline: "ctrm_next", data: { account_id: accountId, stage: "identified", region: "middle_east", company_type: "trading_house", next_action: "Intro email", next_action_date: "2026-12-02" } })

        // Quote: create (Draft), update, finalize, mark sent, convert
        const q = await call("create_quote", {
          account_id: accountId,
          lines: [{ description: "Polo shirt", quantity: 2, unit_price: 100, discount_percent: 10 }, { description: "Cap", quantity: 1, unit_price: 50 }],
          notes: "E2E test",
        })
        assertEquals((q.totals as Row).total, 241.5)
        assertEquals(q.status, "Draft")
        assertEquals((q.totals as Row).currency, "AED")
        const quoteId = String(q.quote_id)
        assertEquals(((await call("get_quote", { quote_id: quoteId })).lines as Row[]).length, 2)
        assertEquals(((await call("update_quote", { quote_id: quoteId, lines: [{ description: "Polo shirt", quantity: 3, unit_price: 100 }] })).totals as Row).total, 315)
        const fin = await call("finalize_quote", { quote_id: quoteId })
        assertMatch(String(fin.quote_number), /^RR-01-\d{5}$/)
        await refused("update_quote", { quote_id: quoteId, notes: "x" }, /Only Draft quotes can be edited/)
        await call("mark_quote_sent", { quote_id: quoteId })
        const conv = await call("convert_quote_to_invoice", { quote_id: quoteId })
        const invoiceId = String(conv.invoice_id)
        assertEquals(conv.invoice_number, fin.quote_number)
        assertEquals((conv.totals as Row).total, 315)

        // Sent invoice is locked; payments, reversal, credit note
        await refused("update_invoice", { invoice_id: invoiceId, notes: "x" }, /cannot be edited/)
        await refused("delete_record", { entity: "invoices", id: invoiceId }, /cannot be edited|cannot be changed|Credit note/i)
        const pay = await call("record_payment", { invoice_id: invoiceId, amount: 100, method: "Bank transfer", reference: "TRX-E2E-1" })
        assertEquals(pay.payment_status, "Partial")
        await refused("record_payment", { invoice_id: invoiceId, amount: 5000, method: "Cash" }, /more than the balance/)
        assertEquals((await call("reverse_payment", { payment_id: (pay.payment as Row).id, reason: "Cheque bounced" })).payment_status, "Pending")
        await call("create_credit_note", { invoice_id: invoiceId, amount: 15, reason: "One shirt returned" })
        const inv = await call("get_invoice", { invoice_id: invoiceId })
        assertEquals((inv.balance as Row).balance, 300)
        assertEquals((await call("record_payment", { invoice_id: invoiceId, amount: 300, method: "Bank transfer" })).payment_status, "Paid")

        // Draft invoice: create, update, delete, restore, finalize
        const d = await call("create_invoice", { client: "MCP E2E Trading LLC", lines: [{ description: "Service", quantity: 1, unit_price: 1000 }] })
        assertEquals(d.status, "Draft")
        assertEquals((d.totals as Row).total, 1050)
        await call("update_invoice", { invoice_id: d.invoice_id, lines: [{ description: "Service", quantity: 2, unit_price: 1000 }] })
        await call("delete_record", { entity: "invoices", id: d.invoice_id })
        await call("restore_record", { entity: "invoices", id: d.invoice_id })
        const df = await call("finalize_invoice", { invoice_id: d.invoice_id })
        assertMatch(String(df.invoice_number), /^RR-01-\d{5}$/)
        assertEquals((df.totals as Row).total, 2100)

        // Expenses
        const ex = (await call("create_expense", { amount_ex_vat: 200, date: "2026-11-20", vendor: "Office Supplies Co", category: "Office" })).expense as Row
        assertEquals(Number(ex.amount), 210)
        assertEquals(Number((await call("update_expense", { expense_id: ex.id, amount_ex_vat: 300 }) as { expense: Row }).expense.amount), 315)

        // Support desk
        const t = await call("create_ticket", { subject: "E2E printer issue", account_id: accountId, message: "First message" })
        const ticketId = String((t.ticket as Row).id)
        await call("update_ticket", { ticket_id: ticketId, priority: "high", status: "open" })
        await call("reply_ticket", { ticket_id: ticketId, body: "We are on it." })
        assertEquals(((await call("close_ticket", { ticket_id: ticketId })).ticket as Row).status, "resolved")

        // Documents
        await call("add_document", { kind: "client", title: "E2E contract", url: "https://drive.google.com/file/d/e2e", company_name: "MCP E2E Trading LLC" })
        await call("add_document", { kind: "company", title: "E2E trade licence", url: "https://drive.google.com/file/d/lic", expires_on: "2027-01-31" })

        // Any area: generic list / get / create / update / delete / restore
        const v = (await call("create_record", { entity: "vendors", data: { company_name: "E2E Vendor", email: "v@example.com" } })).record as Row
        await call("update_record", { entity: "vendors", id: v.id, data: { payment_terms: "30 days" } })
        assertEquals(((await call("get_record", { entity: "vendors", id: v.id })).record as Row).payment_terms, "30 days")
        await call("delete_record", { entity: "vendors", id: v.id })
        assertEquals(((await call("list_records", { entity: "vendors", search: "E2E Vendor" })).items as Row[]).length, 0)
        assertEquals(((await call("list_records", { entity: "vendors", search: "E2E Vendor", include_deleted: true })).items as Row[]).length, 1)
        await call("restore_record", { entity: "vendors", id: v.id })
        await call("create_record", { entity: "purchase_orders", data: { po_number: "PO-E2E-1", vendor_name: "E2E Vendor", status: "draft" } })
        await call("create_record", { entity: "delivery_projects", data: { account_id: accountId, code: "E2E-P1", name: "E2E project", status: "planned" } })
        await refused("create_record", { entity: "vendors", data: { company_name: "X", tenant_id: "b0000000-0000-4000-8000-000000000001" } }, /Invalid fields|tenant_id/)
        await refused("create_record", { entity: "invoices", data: { client: "X" } }, /not changed with create_record/)
        await refused("create_record", { entity: "users", data: { email: "x@y.z" } }, /not changed with create_record/)
        assert(((await call("list_records", { entity: "quotes", filters: { account_id: accountId } })).items as Row[]).length >= 1)

        // HR
        const emp = (await call("create_employee", { employee_code: "E2E-1", full_name: "E2E Person", employment_status: "active", basic_salary_aed: 8000 })).employee as Row
        await call("update_employee", { employee_id: emp.id, job_title: "Designer", iban: "AE070331234567890123456" })
        assertEquals(((await call("get_employee", { employee_id: emp.id })).employee as Row).job_title, "Designer")
        assert(((await call("list_employees", { search: "E2E Person" })).items as Row[]).length === 1)
        const lv = (await call("create_leave_request", { employee_id: emp.id, leave_type: "annual", starts_on: "2026-12-01", ends_on: "2026-12-03", days: 3 })).leave as Row
        await refused("update_leave_request", { leave_id: lv.id, status: "approved" }, /Invalid fields|status/)
        await call("update_leave_request", { leave_id: lv.id, status: "canceled" })

        // Payroll: draft only
        const run = (await call("create_payroll_run", { period_yyyy_mm: "2026-12" })).payroll_run as Row
        assertEquals(run.status, "draft")
        await call("generate_payroll_lines", { run_id: run.id })
        const pr = await call("get_payroll_run", { run_id: run.id })
        const lines = pr.lines as Row[]
        assert(lines.length >= 1, "the run has a line for the active employee")
        const line = lines.find((l) => l.employee_id === emp.id) || lines[0]
        assertEquals(Number(((await call("update_payroll_line", { line_id: line.id, deductions_aed: 100 })).line as Row).deductions_aed), 100)

        // Admin: users read only
        assert(((await call("list_users", { role: "admin" })).items as Row[]).some((u) => u.email === "ai-assistant@redreach.ae"))

        if (mode === "departments") {
          // Outside its departments a key is refused, by the tool and by the database.
          await useKey(deptKeys.sales, ["sales"])
          const deny = async (name: string, args: Row, pattern: RegExp) => {
            const out = await runTool(byName.get(name)!, args, ctx) as { isError?: boolean; content: { text: string }[] }
            assert(out.isError, `${name} should be refused for this key`)
            assertMatch(JSON.parse(out.content[0].text).error, pattern)
          }
          await deny("record_payment", { invoice_id: invoiceId, amount: 1, method: "Cash" }, /departments|not visible|No invoice/i)
          await deny("get_employee", { employee_id: emp.id }, /not visible|No employee/i)
          await deny("get_record", { entity: "employees", id: emp.id }, /outside this key's departments/)
          await useKey(deptKeys.hr, ["hr"])
          await deny("create_quote", { account_id: accountId, lines: [{ description: "x", quantity: 1, unit_price: 1 }] }, /departments|not visible|No account/i)
          await deny("update_record", { entity: "vendors", id: v.id, data: { notes: "x" } }, /outside this key's departments/)
          await useKey(deptKeys.payroll, ["payroll"])
          await deny("update_employee", { employee_id: emp.id, job_title: "x" }, /departments/i)
          await useKey(ADMIN_KEY, ["admin"]) // the audit log is for the admin department only
          const who = await sql.unsafe(`select count(*)::int as n from public.audit_log where operation = 'MCP_WRITE' and actor_email like '%Dept %Grok Bot)'`)
          assert(who[0].n >= 30, "writes are marked with each department key and Grok Bot")
        }

        // Every admin tool ran.
        const missing = ADMIN_TOOLS.map((x) => x.name).filter((n) => !used.has(n))
        assertEquals(missing, [], `admin tools not exercised: ${missing.join(", ")}`)

        // Every write is in the audit log with before and after; the HR change hides salary and IBAN.
        const audit = await sql.unsafe(`select count(*)::int as n from public.audit_log where operation = 'MCP_WRITE'`)
        assert(audit[0].n >= 40, `only ${audit[0].n} AI writes logged`)
        const hr = await sql.unsafe(`select new_data from public.audit_log where operation = 'MCP_WRITE' and new_data ->> 'tool' = 'update_employee'`)
        assertEquals(hr[0].new_data.after.iban, "[hidden]")
        const calls = await sql.unsafe(`select count(*)::int as n from public.audit_log where operation = 'MCP_CALL'`)
        assert(calls[0].n >= used.size, "every tool call is logged too")

        throw new Error("ROLLBACK") // clean up: undo every test record
      }).catch((e: Error) => {
        if (e.message !== "ROLLBACK") throw e
      })
    } finally {
      await pg.end()
    }
  },
})
