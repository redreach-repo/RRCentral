// The HighMast MCP tools. Every query runs through `ctx.db`, a client that acts
// as the key's team member, so row level security decides what is visible.
// No tool deletes anything, and none touches HR, payroll, secrets, settings or
// users. Quotes, invoices and payments are read only.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import type { McpServer } from "npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js"
import { z } from "npm:zod@3.25.76"
import type { McpKey } from "./auth.ts"
import {
  ACCOUNT_TYPE_VALUES,
  AGING_BUCKET_KEYS,
  agingSummary,
  buildAgingRows,
  CHASE_CHANNEL_VALUES,
  chaseSettingsFrom,
  filterAgingRows,
  buildQuoteChaseRows,
  filterQuoteChaseRows,
  QUOTE_CHASE_STATE_VALUES,
  QUOTE_RESPONSE_VALUES,
  quoteChaseSettingsFrom,
  quoteFollowupSummary,
  WAIT_BUCKET_KEYS,
  addDaysIso,
  auditArgs,
  canonicalStage,
  clampPage,
  companySearchWord,
  daysSince,
  invoiceDaysOverdue,
  isOpenCrmStage,
  isOpenDeal,
  isOpenSalesDeal,
  isoDay,
  LEAD_ACCOUNT_TYPE as LEAD_TYPES,
  leadNote,
  likeText,
  MCP_PIPELINE_NAMES as PIPELINE_NAMES,
  MCP_PIPELINES as PIPELINES,
  MCP_STALE_DAYS as STALE_DAYS,
  nextAccountReference,
  pageFrom,
  pageOf,
  sameCompany,
  stageMoveProblem,
  stagesFor,
  ticketReplyAlert,
  toolAllowedForDepartments,
} from "./highmastMcp.bundle.js"

// The bundle is plain JavaScript; these are the types from app/src/lib/highmastMcp.ts.
type McpPipeline = "company" | "ai_crm" | "ctrm_next"
type PipelineInfo = { table: string; stageColumn: string; pipelineKey: string; label: string }
const MCP_PIPELINES = PIPELINES as Record<McpPipeline, PipelineInfo>
const MCP_PIPELINE_NAMES = PIPELINE_NAMES as McpPipeline[]
const MCP_STALE_DAYS = STALE_DAYS as Record<McpPipeline, number>
const LEAD_ACCOUNT_TYPE = LEAD_TYPES as Record<"ai_crm" | "ctrm_next", string>

/** Tables a key with departments may read and write (from public.rr_mcp_reach()). */
export type Reach = { departments: string[]; read: Set<string>; write: Set<string> }
export type ToolContext = { db: SupabaseClient; key: McpKey; now: () => Date; reach?: Reach }

/** Is this tool offered to the key? Standard keys: all of TOOLS. Keys with departments: their departments' tools. */
export function toolOffered(name: string, ctx: Pick<ToolContext, "key">): boolean {
  if (ctx.key.scope !== "admin") return true
  return toolAllowedForDepartments(name, ctx.key.departments || [])
}
export type { Row }

type Row = Record<string, unknown>
type DbResult = { data: unknown; error: { message?: string; code?: string } | null }

/** A message the AI can act on (bad input, not found, not allowed). */
export class ToolError extends Error {}

// ---- Small helpers ----------------------------------------------------------

function pick(row: Row | null | undefined, fields: string[]): Row {
  const out: Row = {}
  if (!row) return out
  for (const f of fields) if (f in row) out[f] = row[f]
  return out
}

// Database errors that are about the input or the rules, so the AI can act on the message.
const RULE_ERRORS = new Set(["23514", "P0001", "P0002", "22023", "23502", "23503", "23505", "22P02", "22007", "22008", "22003"])

export function check(res: DbResult, what: string): unknown {
  if (res.error) {
    const code = res.error.code || ""
    const message = res.error.message || ""
    if (code === "42501" || /row-level security|permission denied/i.test(message)) {
      // Our own rules (raised with 42501) explain themselves; plain RLS refusals do not.
      if (code === "42501" && message && !/row-level security|permission denied/i.test(message)) throw new ToolError(message)
      throw new ToolError(`Not allowed for this key's role: ${what}.`)
    }
    if (RULE_ERRORS.has(code)) throw new ToolError(message || `Could not ${what}.`)
    throw new Error(`Could not ${what}: ${res.error.message || code}`)
  }
  return res.data
}

const isMissingColumn = (e: DbResult["error"]) => !!e && (e.code === "42703" || /column .* does not exist/i.test(e.message || ""))
const isMissingTable = (e: DbResult["error"]) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(e.message || ""))

/** Runs a query hiding soft-deleted rows; retries without the filter when the table has no deleted_at yet. */
async function softRows(build: (soft: boolean) => PromiseLike<DbResult>, what: string): Promise<Row[]> {
  let res = await build(true)
  if (isMissingColumn(res.error)) res = await build(false)
  return (check(res, what) as Row[] | null) || []
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (label: string) => z.string().regex(UUID, `${label} must be a UUID`)
const limitArg = z.number().int().min(1).max(50).optional().describe("Rows per page, 1 to 50 (default 20).")
const offsetArg = z.number().int().min(0).optional().describe("Rows to skip, for the next page use next_offset from the last answer.")
const pipelineArg = z.enum(MCP_PIPELINE_NAMES as [McpPipeline, ...McpPipeline[]])
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

const signature = (key: McpKey) => `\n(added by AI key "${key.keyName}")`

async function ownerNames(db: SupabaseClient, ids: unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))]
  if (!unique.length) return new Map()
  // Only names and emails, to label owners. The users table is never listed or changed.
  const res = await db.from("app_users").select("id, name, email").in("id", unique)
  const rows = (res.error ? [] : res.data || []) as { id: string; name: string; email: string }[]
  return new Map(rows.map((u) => [u.id, u.name || u.email]))
}

/** Owner filter: "me", a member's id, email or name. Returns member ids and a name for the company CRM text field. */
async function resolveOwner(ctx: ToolContext, owner: string): Promise<{ ids: string[]; names: string[] }> {
  const o = owner.trim()
  if (!o) return { ids: [], names: [] }
  if (o.toLowerCase() === "me") return { ids: [ctx.key.memberId], names: [ctx.key.memberName] }
  let q = ctx.db.from("app_users").select("id, name, email").limit(10)
  q = UUID.test(o) ? q.eq("id", o) : o.includes("@") ? q.ilike("email", likeText(o, 120)) : q.ilike("name", `%${likeText(o, 80)}%`)
  const res = await q
  const rows = (res.error ? [] : res.data || []) as { id: string; name: string }[]
  return { ids: rows.map((r) => r.id), names: rows.length ? rows.map((r) => r.name).filter(Boolean) : [o] }
}

async function stagesOf(db: SupabaseClient, pipeline: McpPipeline) {
  const key = MCP_PIPELINES[pipeline].pipelineKey
  const pipe = await db.from("pipelines").select("id").eq("pipeline_key", key).maybeSingle()
  if (pipe.error || !pipe.data) return stagesFor(pipeline, null)
  const st = await db
    .from("pipeline_stages")
    .select("stage_key, outcome, active, sort_order")
    .eq("pipeline_id", (pipe.data as { id: string }).id)
    .order("sort_order")
  return stagesFor(pipeline, st.error ? null : (st.data as { stage_key: string; outcome: string; active: boolean }[]))
}

const ACCOUNT_FIELDS = ["id", "name", "type", "reference", "status", "industry", "country", "city", "website", "source", "notes", "owner_user_id", "created_at", "updated_at"]
const CRM_FIELDS = ["id", "company_name", "primary_contact", "email_phone", "mobile_number", "pipeline_stage", "next_action", "follow_up_date", "owner", "quote_ref", "website", "created_at", "updated_at"]
const SALES_FIELDS = ["id", "account_id", "stage", "source", "owner_user_id", "next_action", "next_action_date", "last_touch_at", "quote_reference", "monthly_fee", "setup_fee", "start_date", "created_at", "updated_at"]
const CTRM_FIELDS = ["id", "account_id", "stage", "region", "company_type", "source", "owner_user_id", "next_action", "next_action_date", "last_touch_at", "created_at", "updated_at"]
const TICKET_FIELDS = ["id", "account_id", "subject", "requester_email", "channel", "priority", "status", "assignee_user_id", "sla_due_at", "first_response_at", "resolved_at", "created_at", "updated_at"]
const QUOTE_FIELDS = ["id", "client", "account_id", "reference_number", "date", "valid_until", "status", "amount", "currency", "quotation_currency", "description", "deal_ref"]
const INVOICE_FIELDS = ["id", "client", "account_id", "reference_number", "date", "status", "payment_status", "payment_terms", "amount", "currency", "description"]

const accountName = (r: Row) => ((r.accounts as { name?: string } | null)?.name ?? null)

function dealRow(pipeline: McpPipeline, r: Row, owners: Map<string, string>): Row {
  if (pipeline === "company") {
    return { pipeline, ...pick(r, CRM_FIELDS), name: r.company_name, stage: r.pipeline_stage, next_action_date: r.follow_up_date, owner_name: r.owner || null }
  }
  const fields = pipeline === "ai_crm" ? SALES_FIELDS : CTRM_FIELDS
  return { pipeline, ...pick(r, fields), name: accountName(r), owner_name: owners.get(String(r.owner_user_id)) ?? null }
}

// ---- Overdue invoice chasing ----------------------------------------------------

/** Rows of a chase table, or [] (and missing) before ar-chase.sql has been run. */
async function chaseRows(build: () => PromiseLike<DbResult>, what: string): Promise<{ rows: Row[]; missing: boolean }> {
  const res = await build()
  if (isMissingTable(res.error)) return { rows: [], missing: true }
  return { rows: (check(res, what) as Row[] | null) || [], missing: false }
}

/** Unpaid invoices with balances, chase log, tasks and schedule, built by the app's rules (arChase.ts). */
async function loadAging(ctx: ToolContext) {
  const [invoices, payments, log, tasks, settings] = await Promise.all([
    softRows((soft) => {
      let q = ctx.db.from("invoices").select("*").neq("payment_status", "Paid").limit(2000)
      if (soft) q = q.is("deleted_at", null)
      return q
    }, "read invoices"),
    ctx.db.from("payment_log").select("invoice_ref, amount").limit(10000),
    chaseRows(() => ctx.db.from("invoice_chase_log").select("*").is("deleted_at", null).limit(5000), "read the chase log"),
    chaseRows(() => ctx.db.from("invoice_chase_tasks").select("*").limit(5000), "read chase tasks"),
    chaseRows(() => ctx.db.from("ar_chase_settings").select("*").limit(1), "read the chase schedule"),
  ])
  const paid = new Map<string, number>()
  // A key that cannot read payments sees full invoice amounts (payments_visible false).
  const paymentsVisible = !payments.error
  for (const p of ((payments.error ? [] : payments.data) || []) as Row[]) {
    const ref = String(p.invoice_ref || "").trim()
    if (ref) paid.set(ref, (paid.get(ref) || 0) + (Number(p.amount) || 0))
  }
  const rows = buildAgingRows({
    invoices: invoices as never,
    paid,
    log: log.rows as never,
    tasks: tasks.rows as never,
    settings: chaseSettingsFrom(settings.rows[0] as never),
    today: ctx.now(),
  }) as Row[]
  return { rows, tasks: tasks.rows, setupMissing: log.missing || tasks.missing || settings.missing, paymentsVisible }
}

// ---- Quote notes and revisions (20261329090000_quote_revisions.sql) --------------

export const QUOTE_SETUP_MISSING = "Quote notes and revisions are not set up in HighMast yet (run quote-revisions.sql)."

/** Was this a missing quote revisions function or table (SQL not run yet)? */
export function isQuoteSetupMissing(e: DbResult["error"]): boolean {
  return !!e && (isMissingTable(e) || e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message || ""))
}

/** One quote by id or by number (e.g. RR-01-26008 or RR-01-26008-R1), visible to this key. */
export async function findQuote(ctx: ToolContext, a: Row): Promise<Row> {
  if (!!a.quote_id === !!a.reference) throw new ToolError("Give exactly one of quote_id or reference.")
  const found = await softRows((soft) => {
    let q = ctx.db.from("quotations").select("*").limit(2)
    q = a.quote_id ? q.eq("id", String(a.quote_id)) : q.eq("reference_number", String(a.reference).trim())
    if (soft) q = q.is("deleted_at", null)
    return q
  }, "find the quote")
  if (!found.length) throw new ToolError("No quote with that id or number is visible to this key.")
  if (found.length > 1) throw new ToolError("More than one quote has that number. Use quote_id.")
  return found[0]
}

/** The notes of a quote's whole chain (all revisions), newest first. */
export async function quoteChainNotes(ctx: ToolContext, q: Row, limit = 20): Promise<Row[]> {
  const base = String(q.base_reference || "").trim() || String(q.reference_number || "").replace(/(_revision\s+\d+|-R\d+)$/i, "")
  let ids = [String(q.id)]
  if (base) {
    // One after the other (not Promise.all): keeps a single connection's work in order.
    const byBase = await ctx.db.from("quotations").select("id").eq("base_reference", base).limit(100)
    const byRef = await ctx.db.from("quotations").select("id").eq("reference_number", base).limit(5)
    for (const r of [...((check(byBase, "read the quote's revisions") as Row[] | null) || []), ...((check(byRef, "read the quote") as Row[] | null) || [])]) {
      ids.push(String(r.id))
    }
    ids = [...new Set(ids)]
  }
  const res = await ctx.db.from("quote_notes").select("created_at, quote_ref, kind, body, created_by_email, source")
    .in("quotation_id", ids).order("created_at", { ascending: false }).limit(limit)
  if (isQuoteSetupMissing(res.error)) return []
  return (check(res, "read quote notes") as Row[] | null) || []
}

// ---- Quote follow-up chasing -------------------------------------------------------

/** Sent quotes waiting for an answer, with follow-ups, tasks, client POs and schedule, by the app's rules (quoteChase.ts). */
async function loadQuoteFollowups(ctx: ToolContext) {
  const [quotes, log, tasks, settings, pos] = await Promise.all([
    softRows((soft) => {
      let q = ctx.db.from("quotations").select("*").in("status", ["Sent", "Accepted", "Expired"]).limit(2000)
      if (soft) q = q.is("deleted_at", null)
      return q
    }, "read quotes"),
    chaseRows(() => ctx.db.from("quote_chase_log").select("*").is("deleted_at", null).limit(5000), "read the follow-up log"),
    chaseRows(() => ctx.db.from("quote_chase_tasks").select("*").limit(5000), "read follow-up tasks"),
    chaseRows(() => ctx.db.from("quote_chase_settings").select("*").limit(1), "read the follow-up schedule"),
    ctx.db.from("client_purchase_orders").select("*").limit(5000),
  ])
  // A key that cannot read client POs still gets the list, without the PO check.
  const poRows = ((pos.error ? [] : pos.data) || []) as Row[]
  const rows = buildQuoteChaseRows({
    quotes: quotes as never,
    log: log.rows as never,
    tasks: tasks.rows as never,
    pos: poRows
      .filter((p) => p.status !== "canceled")
      .map((p) => ({ quotation_id: p.quotation_id ?? null, quote_reference: p.quote_reference ?? null, po_number: String(p.po_number || ""), po_date: p.issued_on ?? null })) as never,
    settings: quoteChaseSettingsFrom(settings.rows[0] as never),
    today: ctx.now(),
  }) as Row[]
  return { rows, setupMissing: log.missing || tasks.missing || settings.missing, posVisible: !pos.error }
}

type FoundDeal = { pipeline: McpPipeline; row: Row }

/** Finds a deal by id in one pipeline, or in all three when none is given. */
async function findDeal(ctx: ToolContext, id: string, pipeline?: McpPipeline): Promise<FoundDeal> {
  const order: McpPipeline[] = pipeline ? [pipeline] : ["company", "ai_crm", "ctrm_next"]
  for (const p of order) {
    const table = MCP_PIPELINES[p].table
    const select = p === "company" ? "*" : "*, accounts(name)"
    const rows = await softRows(
      (soft) => {
        let q = ctx.db.from(table).select(select).eq("id", id).limit(1)
        if (soft) q = q.is("deleted_at", null)
        return q
      },
      `read ${MCP_PIPELINES[p].label} deals`,
    )
    if (rows[0]) return { pipeline: p, row: rows[0] }
  }
  throw new ToolError("No deal with that id is visible to this key.")
}

function isOpen(found: FoundDeal): boolean {
  const stage = String(found.row[MCP_PIPELINES[found.pipeline].stageColumn] || "")
  if (found.pipeline === "company") return isOpenCrmStage(stage)
  return found.pipeline === "ai_crm" ? isOpenSalesDeal({ stage } as never) : isOpenDeal({ stage } as never)
}

async function addAccountNote(ctx: ToolContext, accountId: string, body: string): Promise<string> {
  const res = await ctx.db
    .from("account_activities")
    .insert({ account_id: accountId, kind: "note", body: body.slice(0, 8000), user_id: ctx.key.memberId, user_email: ctx.key.memberEmail })
    .select("id")
    .single()
  return (check(res, "add the timeline note") as { id: string }).id
}

async function addCrmUpdate(ctx: ToolContext, crm: Row, text: string): Promise<string> {
  const res = await ctx.db
    .from("follow_up_updates")
    .insert({ crm_id: crm.id, company: String(crm.company_name || ""), update_text: text.slice(0, 8000), user_email: ctx.key.memberEmail })
    .select("id")
    .single()
  return (check(res, "add the CRM note") as { id: string }).id
}

// ---- Tools ------------------------------------------------------------------

export type ToolDef = {
  name: string
  title: string
  description: string
  input: z.ZodRawShape
  readOnly: boolean
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

export const TOOLS: ToolDef[] = [
  {
    name: "search_accounts",
    title: "Search accounts",
    description: "Find client and prospect accounts by name or reference (AC-..). Optional type filter. Paginated.",
    readOnly: true,
    input: {
      query: z.string().max(100).optional().describe("Part of the account name or reference. Leave empty to list all."),
      type: z.enum(ACCOUNT_TYPE_VALUES as [string, ...string[]]).optional().describe("Account type, e.g. ai_crm_client, ctrm_prospect, worship_church, rr_threads_client."),
      limit: limitArg,
      offset: offsetArg,
    },
    run: async (a, ctx) => {
      const { limit, offset } = clampPage(a.limit, a.offset)
      const text = likeText(a.query)
      const rows = await softRows((soft) => {
        let q = ctx.db.from("accounts").select("*").order("name").range(offset, offset + limit)
        if (text) q = q.or(`name.ilike.%${text}%,reference.ilike.%${text}%`)
        if (a.type) q = q.eq("type", String(a.type))
        if (soft) q = q.is("deleted_at", null)
        return q
      }, "search accounts")
      const owners = await ownerNames(ctx.db, rows.map((r) => r.owner_user_id))
      return pageFrom(rows.map((r) => ({ ...pick(r, ACCOUNT_FIELDS.filter((f) => f !== "notes")), owner_name: owners.get(String(r.owner_user_id)) ?? null })), limit, offset)
    },
  },
  {
    name: "get_account",
    title: "Get account",
    description: "One account with its contacts, open deals, open ticket count and the 20 latest timeline entries.",
    readOnly: true,
    input: { id: uuid("id").describe("Account id from search_accounts.") },
    run: async (a, ctx) => {
      const id = String(a.id)
      const acc = await softRows((soft) => {
        let q = ctx.db.from("accounts").select("*").eq("id", id).limit(1)
        if (soft) q = q.is("deleted_at", null)
        return q
      }, "read the account")
      if (!acc[0]) throw new ToolError("No account with that id is visible to this key.")
      const [contacts, timeline, sales, ctrm, tickets] = await Promise.all([
        ctx.db.from("account_contacts").select("*").eq("account_id", id).order("is_primary", { ascending: false }).limit(50),
        ctx.db.from("account_activities").select("*").eq("account_id", id).order("created_at", { ascending: false }).limit(20),
        softRows((soft) => {
          let q = ctx.db.from("sales_deals").select("*").eq("account_id", id).limit(20)
          if (soft) q = q.is("deleted_at", null)
          return q
        }, "read AI CRM deals"),
        softRows((soft) => {
          let q = ctx.db.from("ctrm_deals").select("*").eq("account_id", id).limit(20)
          if (soft) q = q.is("deleted_at", null)
          return q
        }, "read CTRM Next deals"),
        ctx.db.from("tickets").select("id", { count: "exact", head: true }).eq("account_id", id).in("status", ["new", "open", "waiting_on_client"]),
      ])
      const owners = await ownerNames(ctx.db, [acc[0].owner_user_id, ...sales.map((d) => d.owner_user_id), ...ctrm.map((d) => d.owner_user_id)])
      return {
        account: { ...pick(acc[0], ACCOUNT_FIELDS), owner_name: owners.get(String(acc[0].owner_user_id)) ?? null },
        contacts: ((check(contacts, "read contacts") as Row[]) || []).map((c) => pick(c, ["id", "name", "role", "email", "phone", "whatsapp", "is_primary"])),
        deals: [
          ...sales.map((d) => dealRow("ai_crm", d, owners)),
          ...ctrm.map((d) => dealRow("ctrm_next", d, owners)),
        ],
        open_tickets: tickets.error ? null : tickets.count ?? 0,
        recent_timeline: ((check(timeline, "read the timeline") as Row[]) || []).map((t) => pick(t, ["id", "kind", "body", "user_email", "created_at"])),
      }
    },
  },
  {
    name: "list_deals",
    title: "List deals",
    description:
      "Deals in one pipeline: company (company CRM leads), ai_crm (AI CRM sales) or ctrm_next (CTRM Next). Filter by stage and owner ('me', a name or an email). Open deals only unless include_closed is true. Paginated, most recently changed first.",
    readOnly: true,
    input: {
      pipeline: pipelineArg.describe("company, ai_crm or ctrm_next."),
      stage: z.string().max(60).optional().describe("Stage key, e.g. Lead / Quoted (company), discovery_call (ai_crm), demo_done (ctrm_next)."),
      owner: z.string().max(120).optional().describe("'me', or a team member's name or email."),
      include_closed: z.boolean().optional().describe("Also list won, lost and signed deals."),
      limit: limitArg,
      offset: offsetArg,
    },
    run: async (a, ctx) => {
      const pipeline = a.pipeline as McpPipeline
      const { limit, offset } = clampPage(a.limit, a.offset)
      const cfg = MCP_PIPELINES[pipeline]
      const owner = a.owner ? await resolveOwner(ctx, String(a.owner)) : null
      if (owner && pipeline !== "company" && !owner.ids.length) return pageFrom([], limit, offset)
      const rows = await softRows((soft) => {
        let q = ctx.db.from(cfg.table).select(pipeline === "company" ? "*" : "*, accounts(name)").order("updated_at", { ascending: false }).range(offset, offset + limit)
        if (a.stage) q = q.eq(cfg.stageColumn, String(a.stage))
        else if (!a.include_closed) {
          q = pipeline === "company" ? q.not("pipeline_stage", "in", "(Won,Lost)") : q.not("stage", "in", "(signed,lost)")
        }
        if (owner) {
          if (pipeline === "company") q = q.or(owner.names.map((n) => `owner.ilike.${likeText(n, 80)}`).join(","))
          else q = q.in("owner_user_id", owner.ids)
        }
        if (soft) q = q.is("deleted_at", null)
        return q
      }, `list ${cfg.label} deals`)
      const owners = await ownerNames(ctx.db, rows.map((r) => r.owner_user_id))
      return pageFrom(rows.map((r) => dealRow(pipeline, r, owners)), limit, offset)
    },
  },
  {
    name: "get_deal",
    title: "Get deal",
    description: "One deal with its account, the 10 latest notes and (CTRM Next) stage history. Give the pipeline if you know it.",
    readOnly: true,
    input: { id: uuid("id").describe("Deal id from list_deals."), pipeline: pipelineArg.optional() },
    run: async (a, ctx) => {
      const found = await findDeal(ctx, String(a.id), a.pipeline as McpPipeline | undefined)
      const owners = await ownerNames(ctx.db, [found.row.owner_user_id])
      const deal = { ...dealRow(found.pipeline, found.row, owners), notes: found.row.notes ?? null }
      if (found.pipeline === "company") {
        const upd = await ctx.db.from("follow_up_updates").select("*").eq("crm_id", found.row.id).order("created_at", { ascending: false }).limit(10)
        return { deal, recent_notes: ((upd.error ? [] : upd.data) as Row[]).map((u) => pick(u, ["id", "update_text", "user_email", "created_at"])) }
      }
      const accountId = String(found.row.account_id)
      const [acts, changes] = await Promise.all([
        ctx.db.from("account_activities").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(10),
        found.pipeline === "ctrm_next"
          ? ctx.db.from("ctrm_deal_stage_changes").select("*").eq("deal_id", found.row.id).order("changed_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [], error: null }),
      ])
      return {
        deal,
        account: { id: accountId, name: accountName(found.row) },
        recent_notes: ((acts.error ? [] : acts.data) as Row[]).map((t) => pick(t, ["id", "kind", "body", "user_email", "created_at"])),
        stage_history: ((changes.error ? [] : changes.data) as Row[]).map((c) => pick(c, ["from_stage", "to_stage", "changed_by", "changed_at"])),
      }
    },
  },
  {
    name: "list_follow_ups_due",
    title: "List follow-ups due",
    description: "Open deals in all three pipelines whose next follow-up is due within days_ahead days, overdue ones included. Earliest first. Paginated.",
    readOnly: true,
    input: {
      days_ahead: z.number().int().min(0).max(90).optional().describe("0 = due today or overdue. Default 7."),
      limit: limitArg,
      offset: offsetArg,
    },
    run: async (a, ctx) => {
      const { limit, offset } = clampPage(a.limit, a.offset)
      const now = ctx.now()
      const today = isoDay(now)
      const until = addDaysIso(now, Number(a.days_ahead ?? 7))
      const [crm, sales, ctrm] = await Promise.all([
        softRows((soft) => {
          let q = ctx.db.from("crm").select("*").lte("follow_up_date", until).not("pipeline_stage", "in", "(Won,Lost)").order("follow_up_date").limit(500)
          if (soft) q = q.is("deleted_at", null)
          return q
        }, "read company CRM follow-ups"),
        softRows((soft) => {
          let q = ctx.db.from("sales_deals").select("*, accounts(name)").lte("next_action_date", until).not("stage", "in", "(signed,lost)").order("next_action_date").limit(500)
          if (soft) q = q.is("deleted_at", null)
          return q
        }, "read AI CRM follow-ups"),
        softRows((soft) => {
          let q = ctx.db.from("ctrm_deals").select("*, accounts(name)").lte("next_action_date", until).not("stage", "in", "(signed,lost)").order("next_action_date").limit(500)
          if (soft) q = q.is("deleted_at", null)
          return q
        }, "read CTRM Next follow-ups"),
      ])
      const owners = await ownerNames(ctx.db, [...sales, ...ctrm].map((d) => d.owner_user_id))
      const item = (pipeline: McpPipeline, r: Row) => {
        const d = dealRow(pipeline, r, owners)
        const due = String(d.next_action_date || "")
        return {
          pipeline,
          deal_id: d.id,
          name: d.name,
          stage: d.stage,
          next_action: d.next_action,
          due_date: due,
          overdue_days: due && due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0,
          owner_name: d.owner_name,
        }
      }
      const all = [
        ...crm.map((r) => item("company", r)),
        ...sales.map((r) => item("ai_crm", r)),
        ...ctrm.map((r) => item("ctrm_next", r)),
      ].sort((x, y) => x.due_date.localeCompare(y.due_date))
      return { today, until, ...pageOf(all, limit, offset) }
    },
  },
  {
    name: "list_tickets",
    title: "List support tickets",
    description: "Support tickets, newest first. Filter by status (new, open, waiting_on_client, resolved, closed, or open_any) and account. Paginated.",
    readOnly: true,
    input: {
      status: z.enum(["new", "open", "waiting_on_client", "resolved", "closed", "open_any"]).optional(),
      account_id: uuid("account_id").optional(),
      limit: limitArg,
      offset: offsetArg,
    },
    run: async (a, ctx) => {
      const { limit, offset } = clampPage(a.limit, a.offset)
      const now = ctx.now()
      const rows = await softRows((soft) => {
        let q = ctx.db.from("tickets").select("*, accounts(name)").order("created_at", { ascending: false }).range(offset, offset + limit)
        if (a.status === "open_any") q = q.in("status", ["new", "open", "waiting_on_client"])
        else if (a.status) q = q.eq("status", String(a.status))
        if (a.account_id) q = q.eq("account_id", String(a.account_id))
        if (soft) q = q.is("deleted_at", null)
        return q
      }, "list tickets")
      return pageFrom(
        rows.map((t) => ({ ...pick(t, TICKET_FIELDS), account_name: accountName(t), reply_alert: ticketReplyAlert(t as never, now) })),
        limit,
        offset,
      )
    },
  },
  {
    name: "get_ticket",
    title: "Get support ticket",
    description: "One ticket with its 30 latest messages (oldest first) and whether it is near or past its first reply target.",
    readOnly: true,
    input: { id: uuid("id") },
    run: async (a, ctx) => {
      const rows = await softRows((soft) => {
        let q = ctx.db.from("tickets").select("*, accounts(name)").eq("id", String(a.id)).limit(1)
        if (soft) q = q.is("deleted_at", null)
        return q
      }, "read the ticket")
      const t = rows[0]
      if (!t) throw new ToolError("No ticket with that id is visible to this key.")
      const msgs = await ctx.db.from("ticket_messages").select("*").eq("ticket_id", String(a.id)).order("created_at", { ascending: false }).limit(30)
      return {
        ticket: { ...pick(t, TICKET_FIELDS), account_name: accountName(t), reply_alert: ticketReplyAlert(t as never, ctx.now()) },
        messages: ((check(msgs, "read ticket messages") as Row[]) || [])
          .reverse()
          .map((m) => ({ ...pick(m, ["id", "author_kind", "author_label", "is_internal_note", "created_at"]), body: String(m.body || "").slice(0, 4000) })),
      }
    },
  },
  {
    name: "list_quotes",
    title: "List quotations",
    description: "Quotations, newest first. Read only. Filter by status (Draft, Finalized, Sent, Accepted, Awarded, Not awarded, Expired) and account. Paginated.",
    readOnly: true,
    input: { status: z.string().max(40).optional(), account_id: uuid("account_id").optional(), limit: limitArg, offset: offsetArg },
    run: async (a, ctx) => {
      const { limit, offset } = clampPage(a.limit, a.offset)
      const rows = await softRows((soft) => {
        let q = ctx.db.from("quotations").select("*").order("date", { ascending: false, nullsFirst: false }).range(offset, offset + limit)
        if (a.status) q = q.ilike("status", likeText(a.status, 40))
        if (a.account_id) q = q.eq("account_id", String(a.account_id))
        if (soft) q = q.is("deleted_at", null)
        return q
      }, "list quotations")
      return pageFrom(rows.map((r) => ({ ...pick(r, QUOTE_FIELDS), description: String(r.description || "").slice(0, 300) })), limit, offset)
    },
  },
  {
    name: "list_invoices",
    title: "List invoices",
    description:
      "Invoices, newest first. Read only. Filter by status (Draft, Sent, Awarded, Cancelled). overdue_only lists unpaid invoices past their payment terms, most overdue first, with days_overdue. Paginated.",
    readOnly: true,
    input: { status: z.string().max(40).optional(), overdue_only: z.boolean().optional(), account_id: uuid("account_id").optional(), limit: limitArg, offset: offsetArg },
    run: async (a, ctx) => {
      const { limit, offset } = clampPage(a.limit, a.offset)
      const now = ctx.now()
      const shape = (r: Row) => ({ ...pick(r, INVOICE_FIELDS), description: String(r.description || "").slice(0, 300), days_overdue: invoiceDaysOverdue(r as never, now) })
      if (a.overdue_only) {
        const rows = await softRows((soft) => {
          let q = ctx.db.from("invoices").select("*").neq("payment_status", "Paid").order("date").limit(1000)
          if (a.status) q = q.ilike("status", likeText(a.status, 40))
          if (a.account_id) q = q.eq("account_id", String(a.account_id))
          if (soft) q = q.is("deleted_at", null)
          return q
        }, "list invoices")
        const overdue = rows.map(shape).filter((r) => r.days_overdue != null).sort((x, y) => Number(y.days_overdue) - Number(x.days_overdue))
        return pageOf(overdue, limit, offset)
      }
      const rows = await softRows((soft) => {
        let q = ctx.db.from("invoices").select("*").order("date", { ascending: false, nullsFirst: false }).range(offset, offset + limit)
        if (a.status) q = q.ilike("status", likeText(a.status, 40))
        if (a.account_id) q = q.eq("account_id", String(a.account_id))
        if (soft) q = q.is("deleted_at", null)
        return q
      }, "list invoices")
      return pageFrom(rows.map(shape), limit, offset)
    },
  },
  {
    name: "dashboard_summary",
    title: "Dashboard summary",
    description: "What needs attention now: overdue invoices, receivables aging (totals per currency by age, broken payment promises, the next chase action per overdue invoice), quotes waiting for an answer (value by days waiting, quotes needing a decision such as a client PO received or expired, missed call-backs, the next follow-up per quote), stale deals in each pipeline, support tickets near or past their reply target, and follow-ups due today or overdue. Up to 10 examples of each (20 chase actions).",
    readOnly: true,
    input: {},
    run: async (_a, ctx) => {
      const now = ctx.now()
      const today = isoDay(now)
      // deno-lint-ignore no-explicit-any
      const soft = (table: string, select: string, extra: (q: any) => any) =>
        softRows((s) => {
          // deno-lint-ignore no-explicit-any
          let q: any = ctx.db.from(table).select(select)
          q = extra(q)
          if (s) q = q.is("deleted_at", null)
          return q
        }, `read ${table}`)
      const [aging, followups, invoices, crm, sales, ctrm, tickets] = await Promise.all([
        loadAging(ctx).catch(() => null),
        loadQuoteFollowups(ctx).catch(() => null),
        // deno-lint-ignore no-explicit-any
        soft("invoices", "*", (q: any) => q.neq("payment_status", "Paid").limit(2000)),
        // deno-lint-ignore no-explicit-any
        soft("crm", "*", (q: any) => q.not("pipeline_stage", "in", "(Won,Lost)").limit(2000)),
        // deno-lint-ignore no-explicit-any
        soft("sales_deals", "*, accounts(name)", (q: any) => q.not("stage", "in", "(signed,lost)").limit(2000)),
        // deno-lint-ignore no-explicit-any
        soft("ctrm_deals", "*, accounts(name)", (q: any) => q.not("stage", "in", "(signed,lost)").limit(2000)),
        // deno-lint-ignore no-explicit-any
        soft("tickets", "*, accounts(name)", (q: any) => q.in("status", ["new", "open", "waiting_on_client"]).limit(2000)),
      ])
      const overdue = invoices
        .map((r): Row => ({ ...pick(r, ["id", "client", "reference_number", "date", "amount", "currency", "payment_status"]), days_overdue: invoiceDaysOverdue(r as never, now) }))
        .filter((r) => r.days_overdue != null)
        .sort((x, y) => Number(y.days_overdue) - Number(x.days_overdue))
      const totals: Record<string, number> = {}
      for (const r of overdue) {
        const cur = String(r.currency || "AED")
        totals[cur] = Math.round(((totals[cur] || 0) + Number(r.amount || 0)) * 100) / 100
      }
      const owners = await ownerNames(ctx.db, [...sales, ...ctrm].map((d) => d.owner_user_id))
      const stale = (pipeline: McpPipeline, rows: Row[], touched: string) =>
        rows
          .map((r) => ({ ...dealRow(pipeline, r, owners), days_without_touch: daysSince(r[touched] as string, now) }))
          .filter((d) => d.days_without_touch != null && d.days_without_touch >= MCP_STALE_DAYS[pipeline])
          .sort((x, y) => Number(y.days_without_touch) - Number(x.days_without_touch))
          .map((d) => pick(d as Row, ["pipeline", "id", "name", "stage", "owner_name", "days_without_touch"]))
      const staleDeals = {
        company: stale("company", crm, "updated_at"),
        ai_crm: stale("ai_crm", sales, "last_touch_at"),
        ctrm_next: stale("ctrm_next", ctrm, "last_touch_at"),
      }
      const alerts = tickets
        .map((t): Row => ({ ...pick(t, ["id", "subject", "priority", "status", "sla_due_at"]), account_name: accountName(t), reply_alert: ticketReplyAlert(t as never, now) }))
        .filter((t) => t.reply_alert)
        .sort((x, y) => String(x.sla_due_at).localeCompare(String(y.sla_due_at)))
      const dueNow = [
        ...crm.filter((r) => r.follow_up_date && String(r.follow_up_date) <= today),
        ...sales.filter((r) => r.next_action_date && String(r.next_action_date) <= today),
        ...ctrm.filter((r) => r.next_action_date && String(r.next_action_date) <= today),
      ].length
      return {
        as_of: now.toISOString(),
        overdue_invoices: { count: overdue.length, total_by_currency: totals, top: overdue.slice(0, 10) },
        stale_deals: {
          thresholds_days: MCP_STALE_DAYS,
          count: staleDeals.company.length + staleDeals.ai_crm.length + staleDeals.ctrm_next.length,
          company: { count: staleDeals.company.length, top: staleDeals.company.slice(0, 10) },
          ai_crm: { count: staleDeals.ai_crm.length, top: staleDeals.ai_crm.slice(0, 10) },
          ctrm_next: { count: staleDeals.ctrm_next.length, top: staleDeals.ctrm_next.slice(0, 10) },
        },
        tickets_near_reply_target: {
          count: alerts.length,
          past_target: alerts.filter((t) => t.reply_alert === "breached").length,
          top: alerts.slice(0, 10),
        },
        follow_ups_due_today_or_overdue: dueNow,
        receivables_aging: aging
          ? {
              ...agingSummary(aging.rows as never),
              chase_setup: aging.setupMissing ? "not set up yet (run ar-chase.sql)" : "ok",
              payments_visible: aging.paymentsVisible,
              note: "Balances after logged payments, by age past the due date. next_action is what to do next; nothing is sent to clients automatically.",
            }
          : null,
        quote_followups: followups
          ? {
              ...quoteFollowupSummary(followups.rows as never, now, 10),
              follow_up_setup: followups.setupMissing ? "not set up yet (run quote-chase.sql)" : "ok",
              note: "Sent quotes with no answer yet, by days since sent. next_action is what to do next; nothing is sent to clients and no quote status is changed automatically.",
            }
          : null,
      }
    },
  },
  {
    name: "list_invoice_aging",
    title: "Receivables aging",
    description:
      "Unpaid invoices that have gone out, with the balance after logged payments, days past due, age bucket (current, 1-30, 31-60, 61-90, 90+), last chase, promised payment date (pending or broken) and the next chase action. Totals per currency. Filter by client name, division code (01-06) or bucket. Read only. Paginated.",
    readOnly: true,
    input: {
      client: z.string().max(200).optional(),
      division: z.string().regex(/^\d{2}$/, "Division code, e.g. 03").optional(),
      bucket: z.enum(AGING_BUCKET_KEYS as [string, ...string[]]).optional(),
      broken_promises_only: z.boolean().optional(),
      limit: limitArg,
      offset: offsetArg,
    },
    run: async (a, ctx) => {
      const { limit, offset } = clampPage(a.limit, a.offset)
      const aging = await loadAging(ctx)
      let rows = filterAgingRows(aging.rows as never, { client: String(a.client || ""), division: String(a.division || ""), bucket: String(a.bucket || "") }) as Row[]
      if (a.broken_promises_only) rows = rows.filter((r) => (r.promise as Row | null)?.state === "broken")
      const summary = agingSummary(rows as never)
      return {
        as_of: isoDay(ctx.now()),
        totals_by_currency: summary.totals_by_currency,
        broken_promises: summary.broken_promises.length,
        chase_setup: aging.setupMissing ? "not set up yet (run ar-chase.sql)" : "ok",
        payments_visible: aging.paymentsVisible,
        ...pageOf(rows, limit, offset),
      }
    },
  },
  {
    name: "add_invoice_chase_note",
    title: "Add invoice chase note",
    description:
      "Log a chase of an unpaid invoice: channel (email, call, whatsapp, visit), who was contacted, what was said and any promised payment date. Give invoice_id or reference (e.g. RR-03-26102). It records the chase only: it never sends anything to the client and never changes the invoice or its payments.",
    readOnly: false,
    input: {
      invoice_id: uuid("invoice_id").optional(),
      reference: z.string().max(40).optional().describe("Invoice number, e.g. RR-03-26102."),
      channel: z.enum(CHASE_CHANNEL_VALUES as [string, ...string[]]),
      contact: z.string().max(200).optional().describe("Who was contacted."),
      note: z.string().max(4000).optional().describe("What was said. Needed unless promised_date is given."),
      promised_date: dateArg.optional().describe("Date the client promised to pay, YYYY-MM-DD, on or after the chase date."),
      chased_on: dateArg.optional().describe("When the chase happened, YYYY-MM-DD. Default today; never in the future."),
    },
    run: async (a, ctx) => {
      if (!!a.invoice_id === !!a.reference) throw new ToolError("Give exactly one of invoice_id or reference.")
      const today = isoDay(ctx.now())
      const chasedOn = String(a.chased_on || today)
      if (chasedOn > today) throw new ToolError("The chase date cannot be in the future.")
      const promised = a.promised_date ? String(a.promised_date) : null
      if (promised && promised < chasedOn) throw new ToolError("The promised payment date cannot be before the chase.")
      const note = String(a.note || "").trim()
      if (!note && !promised) throw new ToolError("Add a note or a promised payment date.")
      const found = await softRows((soft) => {
        let q = ctx.db.from("invoices").select("id, reference_number, client, status, payment_status").limit(2)
        q = a.invoice_id ? q.eq("id", String(a.invoice_id)) : q.eq("reference_number", String(a.reference).trim())
        if (soft) q = q.is("deleted_at", null)
        return q
      }, "find the invoice")
      if (!found.length) throw new ToolError("No invoice with that id or number is visible to this key.")
      if (found.length > 1) throw new ToolError("More than one invoice has that number. Use invoice_id.")
      const inv = found[0]
      if (String(inv.payment_status).toLowerCase() === "paid") throw new ToolError(`${inv.reference_number} is paid; there is nothing to chase.`)
      const res = await ctx.db
        .from("invoice_chase_log")
        .insert({
          invoice_id: inv.id,
          chased_on: chasedOn,
          channel: String(a.channel),
          contact: String(a.contact || "").trim(),
          note: (note ? note + signature(ctx.key) : "").slice(0, 4000),
          promised_date: promised,
        })
        .select("id, chased_on, promised_date")
        .single()
      if (isMissingTable(res.error)) throw new ToolError("The chase log is not set up in HighMast yet (run ar-chase.sql).")
      const row = check(res, "log the chase") as Row
      return { added: true, chase_id: row.id, invoice_id: inv.id, reference: inv.reference_number, client: inv.client, chased_on: row.chased_on, promised_date: row.promised_date }
    },
  },
  {
    name: "complete_invoice_chase_task",
    title: "Complete invoice chase task",
    description:
      "Mark a chase task (from list_invoice_aging next actions or dashboard_summary) done or skipped, with what happened. It sends nothing; log the chase itself with add_invoice_chase_note.",
    readOnly: false,
    input: {
      task_id: uuid("task_id"),
      status: z.enum(["done", "skipped"]),
      outcome: z.string().max(2000).optional(),
    },
    run: async (a, ctx) => {
      const res = await ctx.db
        .from("invoice_chase_tasks")
        .update({ status: String(a.status), outcome: (String(a.outcome || "").trim() + signature(ctx.key)).slice(0, 2000) })
        .eq("id", String(a.task_id))
        .eq("status", "open")
        .select("id, invoice_id, step_day, kind, status")
      if (isMissingTable(res.error)) throw new ToolError("Chase tasks are not set up in HighMast yet (run ar-chase.sql).")
      const changed = (check(res, "update the chase task") as Row[] | null) || []
      if (!changed.length) throw new ToolError("No open chase task with that id is visible to this key.")
      return { updated: true, ...changed[0] }
    },
  },
  {
    name: "add_quote_note",
    title: "Add quote note",
    description:
      "Add a note to a quote's append-only notes log (e.g. what was agreed in a meeting). Works in every status, including Sent and other locked quotes; it never changes the quote, its lines or totals. Give quote_id or reference (e.g. RR-01-26008). Returns the latest notes of the quote and all its revisions.",
    readOnly: false,
    input: {
      quote_id: uuid("quote_id").optional(),
      reference: z.string().max(60).optional().describe("Quote number, e.g. RR-01-26008 or RR-01-26008-R1."),
      note: z.string().min(1).max(3800),
    },
    run: async (a, ctx) => {
      const note = String(a.note || "").trim()
      if (!note) throw new ToolError("Write the note.")
      const q = await findQuote(ctx, a)
      const res = await ctx.db
        .from("quote_notes")
        .insert({ quotation_id: q.id, kind: "note", body: (note + signature(ctx.key)).slice(0, 4000) })
        .select("id, created_at")
        .single()
      if (isQuoteSetupMissing(res.error)) throw new ToolError(QUOTE_SETUP_MISSING)
      const row = check(res, "add the quote note") as Row
      return {
        added: true,
        note_id: row.id,
        quote_id: q.id,
        reference: q.reference_number || null,
        client: q.client,
        status: q.status,
        recent_notes: await quoteChainNotes(ctx, q, 10),
      }
    },
  },
  {
    name: "list_quote_followups",
    title: "Quotes waiting for an answer",
    description:
      "Sent (or client-accepted) quotes with no decision yet, plus quotes that expired in the last 7 days: value, days since sent, valid until, last follow-up, the client's answer, any agreed call-back date (pending or missed), a client PO that arrived but is not Awarded yet, and the next follow-up action. Totals per currency by days waiting (0-7, 8-14, 15-30, 31+). Filter by client name or quote number, division code (01-06), bucket or state (decide, expiring, missed, due). Read only. Paginated.",
    readOnly: true,
    input: {
      client: z.string().max(200).optional(),
      division: z.string().regex(/^\d{2}$/, "Division code, e.g. 01").optional(),
      bucket: z.enum(WAIT_BUCKET_KEYS as [string, ...string[]]).optional(),
      state: z.enum(QUOTE_CHASE_STATE_VALUES as [string, ...string[]]).optional(),
      limit: limitArg,
      offset: offsetArg,
    },
    run: async (a, ctx) => {
      const { limit, offset } = clampPage(a.limit, a.offset)
      const data = await loadQuoteFollowups(ctx)
      const today = isoDay(ctx.now())
      const rows = filterQuoteChaseRows(
        data.rows as never,
        { client: String(a.client || ""), division: String(a.division || ""), bucket: String(a.bucket || ""), state: String(a.state || "") },
        today,
      ) as Row[]
      const summary = quoteFollowupSummary(rows as never, ctx.now())
      return {
        as_of: today,
        totals_by_currency: summary.totals_by_currency,
        needs_decision: summary.needs_decision.length,
        missed_callbacks: summary.missed_callbacks.length,
        follow_up_setup: data.setupMissing ? "not set up yet (run quote-chase.sql)" : "ok",
        client_pos_visible: data.posVisible,
        ...pageOf(rows, limit, offset),
      }
    },
  },
  {
    name: "add_quote_chase_note",
    title: "Log a quote follow-up",
    description:
      "Log a follow-up of a sent quote: channel (email, call, whatsapp, visit), who was contacted, what was said, the client's answer (no_reply, interested, needs_changes, on_hold, declined) and any agreed call-back date. Give quote_id or reference (e.g. RR-01-26008). It records the follow-up only: it never sends anything to the client and never changes the quote or its status (use the quote's own tools or buttons for Awarded, Not awarded or a revision).",
    readOnly: false,
    input: {
      quote_id: uuid("quote_id").optional(),
      reference: z.string().max(60).optional().describe("Quote number, e.g. RR-01-26008."),
      channel: z.enum(CHASE_CHANNEL_VALUES as [string, ...string[]]),
      contact: z.string().max(200).optional().describe("Who was contacted."),
      note: z.string().max(3800).optional().describe("What was said. Needed unless response or next_follow_up is given."),
      response: z.enum(QUOTE_RESPONSE_VALUES as [string, ...string[]]).optional(),
      next_follow_up: dateArg.optional().describe("Agreed date to follow up again, YYYY-MM-DD, on or after the follow-up date."),
      chased_on: dateArg.optional().describe("When the follow-up happened, YYYY-MM-DD. Default today; never in the future."),
    },
    run: async (a, ctx) => {
      const today = isoDay(ctx.now())
      const chasedOn = String(a.chased_on || today)
      if (chasedOn > today) throw new ToolError("The follow-up date cannot be in the future.")
      const callback = a.next_follow_up ? String(a.next_follow_up) : null
      if (callback && callback < chasedOn) throw new ToolError("The call-back date cannot be before the follow-up.")
      const note = String(a.note || "").trim()
      const response = a.response ? String(a.response) : ""
      if (!note && !callback && !response) throw new ToolError("Add a note, the client's answer or a call-back date.")
      const q = await findQuote(ctx, a)
      if (!["Sent", "Accepted", "Expired"].includes(String(q.status))) {
        throw new ToolError(`${q.reference_number || "This quote"} is ${q.status}; only sent quotes are followed up.`)
      }
      const res = await ctx.db
        .from("quote_chase_log")
        .insert({
          quotation_id: q.id,
          chased_on: chasedOn,
          channel: String(a.channel),
          contact: String(a.contact || "").trim(),
          note: (note ? note + signature(ctx.key) : "").slice(0, 4000),
          response,
          next_follow_up: callback,
        })
        .select("id, chased_on, response, next_follow_up")
        .single()
      if (isMissingTable(res.error)) throw new ToolError("The quote follow-up log is not set up in HighMast yet (run quote-chase.sql).")
      const row = check(res, "log the follow-up") as Row
      return {
        added: true,
        follow_up_id: row.id,
        quote_id: q.id,
        reference: q.reference_number || null,
        client: q.client,
        status: q.status,
        chased_on: row.chased_on,
        response: row.response || null,
        next_follow_up: row.next_follow_up,
      }
    },
  },
  {
    name: "complete_quote_chase_task",
    title: "Complete quote follow-up task",
    description:
      "Mark a quote follow-up task (from list_quote_followups next actions or dashboard_summary) done or skipped, with what happened. It sends nothing; log the follow-up itself with add_quote_chase_note.",
    readOnly: false,
    input: {
      task_id: uuid("task_id"),
      status: z.enum(["done", "skipped"]),
      outcome: z.string().max(2000).optional(),
    },
    run: async (a, ctx) => {
      const res = await ctx.db
        .from("quote_chase_tasks")
        .update({ status: String(a.status), outcome: (String(a.outcome || "").trim() + signature(ctx.key)).slice(0, 2000) })
        .eq("id", String(a.task_id))
        .eq("status", "open")
        .select("id, quotation_id, step_day, kind, status")
      if (isMissingTable(res.error)) throw new ToolError("Quote follow-up tasks are not set up in HighMast yet (run quote-chase.sql).")
      const changed = (check(res, "update the follow-up task") as Row[] | null) || []
      if (!changed.length) throw new ToolError("No open quote follow-up task with that id is visible to this key.")
      return { updated: true, ...changed[0] }
    },
  },
  {
    name: "create_lead",
    title: "Create lead",
    description:
      "Add a new lead. First checks for an existing company (same name ignoring LLC/FZE etc., or same contact email) and returns the match instead of adding a duplicate. pipeline: company (company CRM, default), ai_crm (AI CRM prospect + deal at Lead) or ctrm_next (CTRM Next prospect + deal at Identified).",
    readOnly: false,
    input: {
      company: z.string().min(1).max(200),
      contact_name: z.string().max(120).optional(),
      email: z.string().email().max(200).optional(),
      phone: z.string().max(40).optional(),
      title: z.string().max(120).optional().describe("The contact's job title."),
      source: z.string().max(80).optional().describe("Where the lead came from, e.g. LinkedIn, referral, event."),
      pipeline: pipelineArg.optional(),
      notes: z.string().max(4000).optional(),
    },
    run: async (a, ctx) => {
      const company = String(a.company).trim()
      const email = String(a.email || "").trim().toLowerCase()
      const pipeline = (a.pipeline as McpPipeline | undefined) || "company"
      const word = likeText(companySearchWord(company), 60)

      // 1. Existing company?
      const [accs, crms, contactHits] = await Promise.all([
        word ? ctx.db.from("accounts").select("id, name, type, reference, status").ilike("name", `%${word}%`).limit(100) : Promise.resolve({ data: [], error: null }),
        word ? ctx.db.from("crm").select("id, company_name, pipeline_stage").ilike("company_name", `%${word}%`).limit(100) : Promise.resolve({ data: [], error: null }),
        email ? ctx.db.from("account_contacts").select("account_id, name, email, accounts(id, name, type, reference)").ilike("email", email).limit(10) : Promise.resolve({ data: [], error: null }),
      ])
      const matches: Row[] = []
      for (const r of ((accs.error ? [] : accs.data) as Row[])) {
        if (sameCompany(String(r.name), company)) matches.push({ kind: "account", ...r })
      }
      for (const r of ((crms.error ? [] : crms.data) as Row[])) {
        if (sameCompany(String(r.company_name), company)) matches.push({ kind: "company_crm", id: r.id, name: r.company_name, stage: r.pipeline_stage })
      }
      for (const r of ((contactHits.error ? [] : contactHits.data) as Row[])) {
        const acc = r.accounts as Row | null
        if (acc && !matches.some((m) => m.id === acc.id)) matches.push({ kind: "account", matched_on: "contact email", ...acc })
      }
      if (matches.length) {
        return {
          created: false,
          reason: "This company is already in HighMast. Nothing was added. Use add_timeline_note to log the new contact.",
          matches: matches.slice(0, 10),
        }
      }

      const note = leadNote({ source: String(a.source || ""), title: String(a.title || ""), notes: String(a.notes || ""), keyName: ctx.key.keyName })
      const contactName = String(a.contact_name || "").trim()
      const phone = String(a.phone || "").trim()
      const today = isoDay(ctx.now())
      const stamp = ctx.now().toISOString()

      // 2a. Company CRM lead.
      if (pipeline === "company") {
        const res = await ctx.db
          .from("crm")
          .insert({
            company_name: company,
            primary_contact: contactName,
            email_phone: email,
            mobile_number: phone,
            notes: note,
            follow_up_date: today,
            next_action: "Call",
            pipeline_stage: "Lead",
            contacts: contactName || email || phone
              ? [{ id: crypto.randomUUID(), name: contactName, email, phone, role: String(a.title || "Primary") }]
              : [],
            created_by: ctx.key.memberEmail,
            updated_by: ctx.key.memberEmail,
            created_at: stamp,
            updated_at: stamp,
          })
          .select("id")
          .single()
        const id = (check(res, "add the CRM lead") as { id: string }).id
        return { created: true, pipeline, crm_id: id, deal_id: id, stage: "Lead", follow_up_date: today }
      }

      // 2b. AI CRM or CTRM Next: account, contact, deal, timeline.
      const type = LEAD_ACCOUNT_TYPE[pipeline as "ai_crm" | "ctrm_next"]
      const refsRes = await ctx.db.from("accounts").select("reference").eq("type", type).limit(5000)
      const refs = ((refsRes.error ? [] : refsRes.data) as { reference: string }[]).map((r) => r.reference)
      let accountId = ""
      let reference = ""
      for (let attempt = 0; attempt < 5 && !accountId; attempt++) {
        reference = nextAccountReference(type, refs)
        const res = await ctx.db
          .from("accounts")
          .insert({
            type,
            name: company,
            reference,
            status: "prospect",
            owner_user_id: ctx.key.role === "staff" ? ctx.key.memberId : null,
            source: String(a.source || "AI connector"),
            notes: note,
            created_by: ctx.key.memberEmail,
          })
          .select("id")
          .single()
        if (!res.error && res.data) accountId = (res.data as { id: string }).id
        else if (res.error?.code === "23505") refs.push(reference)
        else check(res, "add the account")
      }
      if (!accountId) throw new Error("Could not find a free account reference")
      let contactId: string | null = null
      if (contactName || email || phone) {
        const c = await ctx.db
          .from("account_contacts")
          .insert({ account_id: accountId, name: contactName, role: String(a.title || ""), email, phone, is_primary: true })
          .select("id")
          .single()
        contactId = (check(c, "add the contact") as { id: string }).id
      }
      const firstStage = pipeline === "ai_crm" ? "lead" : "identified"
      const deal = await ctx.db
        .from(MCP_PIPELINES[pipeline].table)
        .insert({
          account_id: accountId,
          stage: firstStage,
          source: String(a.source || "AI connector"),
          owner_user_id: ctx.key.role === "staff" ? ctx.key.memberId : null,
          next_action: "Call the new lead",
          next_action_date: today,
          notes: note,
          created_by: ctx.key.memberEmail,
          ...(pipeline === "ctrm_next" && contactId ? { primary_contact_id: contactId } : {}),
        })
        .select("id")
        .single()
      const dealId = (check(deal, "add the deal") as { id: string }).id
      if (pipeline === "ctrm_next") {
        await ctx.db.from("ctrm_deal_stage_changes").insert({ deal_id: dealId, from_stage: "", to_stage: firstStage, changed_by: ctx.key.memberEmail })
      }
      await addAccountNote(ctx, accountId, note)
      return { created: true, pipeline, account_id: accountId, reference, contact_id: contactId, deal_id: dealId, stage: firstStage }
    },
  },
  {
    name: "add_timeline_note",
    title: "Add timeline note",
    description: "Add a note to an account's timeline (account_id) or to a deal (deal_id, any pipeline). Give exactly one of the two.",
    readOnly: false,
    input: {
      account_id: uuid("account_id").optional(),
      deal_id: uuid("deal_id").optional(),
      pipeline: pipelineArg.optional().describe("The deal's pipeline, if known."),
      text: z.string().min(1).max(4000),
    },
    run: async (a, ctx) => {
      if (!!a.account_id === !!a.deal_id) throw new ToolError("Give exactly one of account_id or deal_id.")
      const text = String(a.text).trim() + signature(ctx.key)
      if (a.account_id) {
        const acc = await ctx.db.from("accounts").select("id, name").eq("id", String(a.account_id)).maybeSingle()
        if (!acc.data) throw new ToolError("No account with that id is visible to this key.")
        const id = await addAccountNote(ctx, String(a.account_id), text)
        return { added: true, note_id: id, account_id: a.account_id }
      }
      const found = await findDeal(ctx, String(a.deal_id), a.pipeline as McpPipeline | undefined)
      if (found.pipeline === "company") {
        const id = await addCrmUpdate(ctx, found.row, text)
        return { added: true, note_id: id, pipeline: found.pipeline, deal_id: found.row.id }
      }
      const label = MCP_PIPELINES[found.pipeline].label
      const id = await addAccountNote(ctx, String(found.row.account_id), `[${label} deal] ${text}`)
      return { added: true, note_id: id, pipeline: found.pipeline, deal_id: found.row.id, account_id: found.row.account_id }
    },
  },
  {
    name: "move_deal_stage",
    title: "Move deal stage",
    description:
      "Move a deal one or more stages forward. Never backwards, and never to won, lost or signed (a person closes deals). An open stage needs a next action and date: pass next_action and next_action_date if the deal has none.",
    readOnly: false,
    input: {
      deal_id: uuid("deal_id"),
      stage: z.string().min(1).max(60).describe("Target stage key, e.g. Contacted, Quoted, Negotiation (company); discovery_call, quote_sent (ai_crm); contacted ... decision_pending (ctrm_next)."),
      pipeline: pipelineArg.optional(),
      next_action: z.string().max(200).optional(),
      next_action_date: dateArg.optional(),
    },
    run: async (a, ctx) => {
      const found = await findDeal(ctx, String(a.deal_id), a.pipeline as McpPipeline | undefined)
      const cfg = MCP_PIPELINES[found.pipeline]
      const from = String(found.row[cfg.stageColumn] || "")
      const stages = await stagesOf(ctx.db, found.pipeline)
      const problem = stageMoveProblem(stages, from, String(a.stage))
      if (problem) throw new ToolError(problem)
      const to = canonicalStage(stages, String(a.stage))
      const stamp = ctx.now().toISOString()
      const patch: Row = { [cfg.stageColumn]: to, updated_at: stamp }
      if (found.pipeline === "company") {
        patch.updated_by = ctx.key.memberEmail
        if (a.next_action) patch.next_action = String(a.next_action)
        if (a.next_action_date) patch.follow_up_date = String(a.next_action_date)
      } else {
        patch.last_touch_at = stamp
        if (a.next_action) patch.next_action = String(a.next_action)
        if (a.next_action_date) patch.next_action_date = String(a.next_action_date)
      }
      const res = await ctx.db.from(cfg.table).update(patch).eq("id", String(found.row.id)).eq(cfg.stageColumn, from).select("id")
      const changed = (check(res, "move the deal") as Row[] | null) || []
      if (!changed.length) throw new ToolError("The deal was not moved: this key cannot change it, or someone moved it meanwhile.")
      if (found.pipeline === "ctrm_next") {
        await ctx.db.from("ctrm_deal_stage_changes").insert({ deal_id: found.row.id, from_stage: from, to_stage: to, changed_by: ctx.key.memberEmail })
      }
      return { moved: true, pipeline: found.pipeline, deal_id: found.row.id, from_stage: from, to_stage: to }
    },
  },
  {
    name: "create_follow_up",
    title: "Create follow-up",
    description: "Set the next follow-up on an open deal (any pipeline): its due date and what to do. Also logs it as a note on the deal.",
    readOnly: false,
    input: {
      deal_id: uuid("deal_id"),
      due_date: dateArg.describe("YYYY-MM-DD, today or later."),
      note: z.string().min(1).max(500).describe("What to do, e.g. 'Call Sara about the revised quote'."),
      pipeline: pipelineArg.optional(),
    },
    run: async (a, ctx) => {
      const due = String(a.due_date)
      const today = isoDay(ctx.now())
      if (due < today) throw new ToolError("The follow-up date must be today or later.")
      if (due > addDaysIso(ctx.now(), 366)) throw new ToolError("The follow-up date must be within a year.")
      const found = await findDeal(ctx, String(a.deal_id), a.pipeline as McpPipeline | undefined)
      if (!isOpen(found)) throw new ToolError("This deal is closed; follow-ups go on open deals only.")
      const cfg = MCP_PIPELINES[found.pipeline]
      const note = String(a.note).trim()
      const stamp = ctx.now().toISOString()
      const patch: Row =
        found.pipeline === "company"
          ? { follow_up_date: due, next_action: String(found.row.next_action || "") || "Other", updated_at: stamp, updated_by: ctx.key.memberEmail }
          : { next_action: note.slice(0, 200), next_action_date: due, updated_at: stamp }
      const res = await ctx.db.from(cfg.table).update(patch).eq("id", String(found.row.id)).select("id")
      const changed = (check(res, "set the follow-up") as Row[] | null) || []
      if (!changed.length) throw new ToolError("The follow-up was not set: this key cannot change this deal.")
      const text = `Follow-up set for ${due}: ${note}${signature(ctx.key)}`
      const noteId =
        found.pipeline === "company"
          ? await addCrmUpdate(ctx, found.row, text)
          : await addAccountNote(ctx, String(found.row.account_id), `[${cfg.label} deal] ${text}`)
      return { created: true, pipeline: found.pipeline, deal_id: found.row.id, due_date: due, note_id: noteId }
    },
  },
]

/** Writes the call to audit_log through rr_mcp_log_call. Returns false when that failed. */
async function audit(ctx: ToolContext, tool: string, args: unknown, ok: boolean, error = ""): Promise<boolean> {
  try {
    const res = await ctx.db.rpc("rr_mcp_log_call", { p_tool: tool, p_args: auditArgs(args), p_ok: ok, p_error: error.slice(0, 500) })
    return !res.error
  } catch {
    return false
  }
}

const text = (value: unknown) => ({ type: "text" as const, text: JSON.stringify(value, null, 2) })

/** Runs one tool: the call, then the audit log. A read whose audit fails is withheld. */
export async function runTool(def: ToolDef, args: Record<string, unknown>, ctx: ToolContext) {
  try {
    const result = await def.run(args, ctx)
    const logged = await audit(ctx, def.name, args, true)
    if (!logged && def.readOnly) {
      return { isError: true, content: [text({ error: "Could not write the audit log, so the answer is withheld. Try again shortly." })] }
    }
    return { content: [text(logged ? result : { ...(result as Row), audit_warning: "The audit log could not be written for this call." })] }
  } catch (e) {
    const known = e instanceof ToolError
    const message = known ? e.message : "Something went wrong in HighMast. The call was logged."
    await audit(ctx, def.name, args, false, e instanceof Error ? e.message : String(e))
    if (!known) console.error(`highmast-mcp ${def.name}:`, e instanceof Error ? e.message : e)
    return { isError: true, content: [text({ error: message })] }
  }
}

export function registerTools(server: McpServer, ctx: ToolContext) {
  for (const def of TOOLS) {
    if (!toolOffered(def.name, ctx)) continue
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: { readOnlyHint: def.readOnly, destructiveHint: false, idempotentHint: def.readOnly, openWorldHint: false },
      },
      // deno-lint-ignore no-explicit-any
      ((args: Record<string, unknown>) => runTool(def, args || {}, ctx)) as any,
    )
  }
}
