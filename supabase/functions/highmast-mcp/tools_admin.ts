// Admin scope tools (keys with scope "admin", acting as the AI Assistant admin member).
//
// Every write goes through a database function from
// supabase/migrations/20261324090000_highmast_mcp_admin.sql, which runs as the
// caller (row level security applies) and writes the before and after of the
// record to audit_log. The database also enforces, whatever this file does:
//   * no hard deletes (delete_record sets deleted_at; restore_record clears it),
//   * sent invoices and recorded payments never change (credit note / reversal),
//   * payroll runs stay draft and leave is never approved by the AI,
//   * settings, secrets, keys, tokens and users are never written.
// Each call is also logged as an "AI tool call" by runTool, like every tool.
import type { McpServer } from "npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js"
import { z } from "npm:zod@3.25.76"
import { check, runTool, ToolError, type Row, type ToolContext, type ToolDef } from "./tools.ts"
import {
  divisionVertical,
  DIVISION_CODES as DIVISION_CODE_LIST,
  expenseAmounts,
  likeText,
  vatRateFromPercent,
} from "./highmastMcp.bundle.js"

const DIVISION_CODES = DIVISION_CODE_LIST as string[]

// ---- Field types -------------------------------------------------------------

type FieldType = "text" | "long" | "email" | "url" | "uuid" | "date" | "number" | "money" | "int" | "bool" | "json" | readonly string[]
type Fields = Record<string, FieldType>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, "must be a UUID")
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")

function zodFor(t: FieldType): z.ZodTypeAny {
  if (Array.isArray(t)) return z.enum(t as [string, ...string[]])
  switch (t) {
    case "text": return z.string().max(500)
    case "long": return z.string().max(8000)
    case "email": return z.string().max(200)
    case "url": return z.string().url().max(2000)
    case "uuid": return uuid.nullable()
    case "date": return date.nullable()
    case "number": return z.number().finite()
    case "money": return z.number().finite().min(0).max(1e12)
    case "int": return z.number().int()
    case "bool": return z.boolean()
    case "json": return z.unknown()
  }
  return z.unknown()
}

function shapeOf(fields: Fields, describe: Record<string, string> = {}): z.ZodRawShape {
  const shape: z.ZodRawShape = {}
  for (const [k, t] of Object.entries(fields)) {
    let s = zodFor(t)
    if (describe[k]) s = s.describe(describe[k])
    shape[k] = s.optional()
  }
  return shape
}

function fieldList(fields: Fields): string {
  return Object.entries(fields)
    .map(([k, t]) => `${k} (${Array.isArray(t) ? t.join("|") : t})`)
    .join(", ")
}

// ---- Entities: every area of HighMast ---------------------------------------
//
// write: false means generic create/update is refused, because the entity has
// its own tool with the app's rules (quotes, invoices, payments, payroll) or is
// read only (users, ledger, income).

type Entity = {
  table: string
  label: string
  area: string
  search: string[]
  order: string
  write: boolean
  soft: boolean
  fields: Fields
  required?: string[]
  hide?: string[]
}

const PIPELINE_STAGES_COMPANY = ["Lead", "Contacted", "Quoted", "Negotiation", "Won", "Lost"] as const
const SALES_STAGES = ["lead", "discovery_call", "quote_sent", "signed", "lost"] as const
const CTRM_STAGES = ["identified", "contacted", "intro_call_booked", "demo_done", "evaluating", "decision_pending", "signed", "lost"] as const
const LOST_REASONS = ["Price", "Competitor won", "Timing / budget", "Scope mismatch", "No response", "Relationship", "Other"] as const

const ACCOUNT_TYPES = ["rr_threads_client", "rr_wanders_client", "rr_marketing_client", "rr_connect_client", "rr_care_client", "rr_trading_client", "ai_crm_client", "worship_church", "ctrm_prospect"] as const
const COMPANY_DOC_CATEGORIES = ["trade_license", "vat_certificate", "chamber_certificate", "insurance", "memorandum", "other"] as const
const ACCOUNT_FIELDS: Fields = {
  name: "text", type: ACCOUNT_TYPES, reference: "text", industry: "text", country: "text", city: "text", website: "text",
  status: "text", owner_user_id: "uuid", source: "text", notes: "long", credit_limit_aed: "money", credit_hold: "bool",
}
const CONTACT_FIELDS: Fields = {
  account_id: "uuid", name: "text", role: "text", email: "email", phone: "text", whatsapp: "text", is_primary: "bool",
}
const CRM_FIELDS: Fields = {
  company_name: "text", primary_contact: "text", email_phone: "text", mobile_number: "text", office_number: "text",
  notes: "long", follow_up_date: "date", next_action: "text", owner: "text", company_owner: "text", address: "text",
  website: "text", trn: "text", pipeline_stage: PIPELINE_STAGES_COMPANY, quote_ref: "text", outcome_reason: LOST_REASONS,
  lost_note: "long", account_id: "uuid",
}
const SALES_FIELDS: Fields = {
  account_id: "uuid", stage: SALES_STAGES, source: "text", owner_user_id: "uuid", next_action: "text", next_action_date: "date",
  lost_reason: "long", lost_reason_code: LOST_REASONS, notes: "long", discovery_call_date: "date", option: ["A", "B"],
  monthly_fee: "money", setup_fee: "money", discount_percent: "number", discount_months: "int", start_date: "date",
  quote_reference: "text",
}
const CTRM_FIELDS: Fields = {
  account_id: "uuid", stage: CTRM_STAGES, region: ["middle_east", "india"], company_type: ["trading_house", "energy", "other"],
  primary_contact_id: "uuid", source: "text", owner_user_id: "uuid", next_action: "text", next_action_date: "date",
  lost_reason: "long", lost_reason_code: LOST_REASONS, notes: "long",
}
const EXPENSE_STATUSES = ["Recorded", "Pending Approval", "Canceled"] as const
const EXPENSE_FIELDS: Fields = {
  date: "date", vendor: "text", category: "text", payment_method: "text", references_text: "text", notes: "long",
  quote_ref: "text", supplier_invoice_no: "text", status: EXPENSE_STATUSES,
}
const TICKET_STATUSES = ["new", "open", "waiting_on_client", "resolved", "closed"] as const
const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const
const TICKET_CHANNELS = ["email", "whatsapp", "phone", "in_person", "internal", "web_form", "chatbot", "ctrm_next"] as const
const TICKET_FIELDS: Fields = {
  account_id: "uuid", contact_id: "uuid", requester_email: "email", requester_phone: "text", subject: "text",
  channel: TICKET_CHANNELS, priority: TICKET_PRIORITIES, status: TICKET_STATUSES, assignee_user_id: "uuid",
  vendor_ticket_ref: "text", vendor_status: ["", "not_raised", "raised", "in_progress", "fixed", "waiting_for_client"],
}
const EMPLOYEE_FIELDS: Fields = {
  employee_code: "text", full_name: "text", email: "email", job_title: "text", department: "text",
  employment_status: ["active", "onboarding", "leave", "exited"], start_date: "date", end_date: "date",
  basic_salary_aed: "money", allowances_aed: "money", iban: "text", labour_card_no: "text", bank_routing_code: "text",
  reports_to_id: "uuid", app_user_id: "uuid", notes: "long",
}
const LEAVE_FIELDS: Fields = {
  employee_id: "uuid", leave_type: ["annual", "sick", "unpaid", "other"], starts_on: "date", ends_on: "date",
  days: "number", status: ["pending", "canceled"], reason: "long",
}

export const ENTITIES: Record<string, Entity> = {
  accounts: { table: "accounts", label: "Accounts (clients and prospects)", area: "CRM", search: ["name", "reference"], order: "name", write: true, soft: true, fields: ACCOUNT_FIELDS, required: ["name", "type"] },
  contacts: { table: "account_contacts", label: "Contacts on accounts", area: "CRM", search: ["name", "email", "phone"], order: "name", write: true, soft: true, fields: CONTACT_FIELDS, required: ["account_id", "name"] },
  company_deals: { table: "crm", label: "Company CRM deals (pipeline company)", area: "CRM", search: ["company_name", "primary_contact"], order: "updated_at.desc", write: true, soft: true, fields: CRM_FIELDS, required: ["company_name"] },
  ai_crm_deals: { table: "sales_deals", label: "AI CRM deals (pipeline ai_crm)", area: "CRM", search: ["next_action", "notes"], order: "updated_at.desc", write: true, soft: true, fields: SALES_FIELDS, required: ["account_id"] },
  ctrm_deals: { table: "ctrm_deals", label: "CTRM Next deals (pipeline ctrm_next)", area: "CRM", search: ["next_action", "notes"], order: "updated_at.desc", write: true, soft: true, fields: CTRM_FIELDS, required: ["account_id"] },
  timeline: { table: "account_activities", label: "Account timeline notes", area: "CRM", search: ["body"], order: "created_at.desc", write: true, soft: false, fields: { account_id: "uuid", kind: ["note", "call", "email", "meeting"], body: "long" }, required: ["account_id", "body"] },
  clients: { table: "clients", label: "Client accounts (bill-to details)", area: "Client accounts", search: ["company_name", "primary_contact", "email"], order: "company_name", write: true, soft: false, fields: { company_name: "text", primary_contact: "text", email: "email", mobile: "text", office: "text", address: "long", trn: "text", website: "text", company_owner: "text", notes: "long", account_id: "uuid", drive_folder_url: "text" }, required: ["company_name"] },
  client_purchase_orders: { table: "client_purchase_orders", label: "Client purchase orders", area: "Client accounts", search: ["po_number", "notes"], order: "created_at.desc", write: true, soft: false, fields: { account_id: "uuid", client_id: "uuid", po_number: "text", status: ["open", "partial", "fulfilled", "canceled"], issued_on: "date", expires_on: "date", currency: "text", amount: "money", notes: "long", division_code: "text", contact_name: "text", delivery_date: "date", delivery_address: "long", delivery_terms: "text", payment_terms: "text" }, required: ["po_number"] },
  quotes: { table: "quotations", label: "Quotations (use the quote tools to change)", area: "Quotations", search: ["client", "reference_number", "description"], order: "created_at.desc", write: false, soft: true, fields: {} },
  invoices: { table: "invoices", label: "Invoices and credit notes (use the invoice tools to change)", area: "Invoices", search: ["client", "reference_number", "description"], order: "created_at.desc", write: false, soft: true, fields: {} },
  payments: { table: "payment_log", label: "Invoice payments and reversals (use record_payment / reverse_payment)", area: "Payments", search: ["invoice_ref", "client", "external_ref"], order: "created_at.desc", write: false, soft: false, fields: {} },
  customer_payments: { table: "customer_payments", label: "Customer payments for bookings (read only)", area: "Payments", search: ["client", "invoice_ref", "quote_ref", "transaction_ref"], order: "created_at.desc", write: false, soft: true, fields: {} },
  income: { table: "income", label: "Income ledger (kept in step with invoices; read only)", area: "Finance", search: ["client_source", "reference_number"], order: "date.desc", write: false, soft: false, fields: {} },
  expenses: { table: "expenses", label: "Expenses (use create_expense / update_expense for VAT)", area: "Expenses", search: ["vendor", "category", "supplier_invoice_no", "notes"], order: "date.desc", write: false, soft: true, fields: {} },
  vendors: { table: "vendors", label: "Vendors / suppliers", area: "Operations", search: ["company_name", "primary_contact", "email"], order: "company_name", write: true, soft: true, fields: { company_name: "text", primary_contact: "text", email: "email", mobile: "text", office: "text", address: "long", trn: "text", website: "text", payment_terms: "text", notes: "long", active: "bool" }, required: ["company_name"] },
  purchase_orders: { table: "purchase_orders", label: "Purchase orders to suppliers", area: "Operations", search: ["po_number", "vendor_name"], order: "created_at.desc", write: true, soft: true, fields: { po_number: "text", vendor_name: "text", status: ["draft", "ordered", "partial", "received", "canceled"], order_date: "date", expected_date: "date", currency: "text", notes: "long", landed_cost_aed: "money", warehouse_id: "uuid" }, required: ["po_number", "vendor_name"] },
  products: { table: "products", label: "Products / catalogue", area: "Operations", search: ["sku", "name"], order: "name", write: true, soft: true, fields: { sku: "text", name: "text", division_code: "text", unit_price: "money", unit_cost: "money", moq: "int", fabric: "text", unit: "text", active: "bool", notes: "long", reorder_level: "number", track_sizes: "bool" }, required: ["sku", "name"] },
  warehouses: { table: "warehouses", label: "Warehouses", area: "Operations", search: ["code", "name"], order: "name", write: true, soft: false, fields: { code: "text", name: "text", is_default: "bool", active: "bool" }, required: ["code", "name"] },
  warehouse_stock: { table: "warehouse_stock", label: "Stock per warehouse (read only)", area: "Operations", search: ["sku"], order: "sku", write: false, soft: false, fields: {} },
  construction_sites: { table: "construction_sites", label: "Construction sites", area: "Operations", search: ["code", "name", "location"], order: "name", write: true, soft: true, fields: { code: "text", name: "text", location: "text", status: ["planned", "active", "on_hold", "closed"], notes: "long" }, required: ["name"] },
  build_tasks: { table: "build_tasks", label: "Client build / onboarding tasks", area: "Client delivery", search: ["title", "detail"], order: "sort", write: true, soft: true, fields: { account_id: "uuid", stage: ["discovery", "requirements_signed_off", "build", "whatsapp_setup", "testing", "live"], title: "text", detail: "long", est_hours: "number", done: "bool", sort: "int", kind: ["task", "golive"], owner: ["red_reach", "client"], owner_user_id: "uuid", due_date: "date" }, required: ["account_id", "title"] },
  delivery_projects: { table: "delivery_projects", label: "Delivery projects", area: "Client delivery", search: ["code", "name"], order: "created_at.desc", write: true, soft: true, fields: { account_id: "uuid", code: "text", name: "text", status: ["planned", "active", "on_hold", "done", "canceled"], starts_on: "date", ends_on: "date", budget_aed: "money", notes: "long", retention_pct: "number" }, required: ["name"] },
  delivery_notes: { table: "delivery_notes", label: "Delivery notes (read only: numbered in the app)", area: "Client delivery", search: ["client", "reference_number", "description"], order: "created_at.desc", write: false, soft: true, fields: {} },
  time_entries: { table: "time_entries", label: "Time entries", area: "Client delivery", search: ["note", "category"], order: "date.desc", write: true, soft: false, fields: { account_id: "uuid", user_id: "uuid", user_email: "email", date: "date", hours: "number", category: ["build", "support", "reporting", "leads", "content", "admin"], note: "long", ticket_id: "uuid" }, required: ["date", "hours"] },
  contracts: { table: "contracts", label: "Service contracts", area: "Finance", search: ["status", "notes"], order: "created_at.desc", write: true, soft: false, fields: { account_id: "uuid", package_id: "uuid", option: ["A", "B"], monthly_fee: "money", setup_fee: "money", term_start: "date", term_end: "date", discount_percent: "number", status: ["draft", "active", "ended", "cancelled"], notes: "long", auto_invoice: "bool", billing_from: "date" }, required: ["account_id"] },
  ledger_journals: { table: "gl_journals", label: "Ledger journals (read only)", area: "Finance", search: ["journal_number", "memo"], order: "entry_date.desc", write: false, soft: false, fields: {} },
  tickets: { table: "tickets", label: "Support tickets", area: "Support desk", search: ["subject", "requester_email"], order: "created_at.desc", write: true, soft: true, fields: TICKET_FIELDS, required: ["subject"] },
  ticket_messages: { table: "ticket_messages", label: "Ticket messages (use reply_ticket to add)", area: "Support desk", search: ["body"], order: "created_at.desc", write: false, soft: false, fields: {} },
  customer_documents: { table: "customer_documents", label: "Client documents (links)", area: "Documents", search: ["company_name", "title", "file_name", "related_ref"], order: "uploaded_at.desc", write: true, soft: true, fields: { company_name: "text", crm_id: "uuid", category: "text", title: "text", file_name: "text", drive_url: "url", related_ref: "text", notes: "long", storage_provider: "text" }, required: ["title"] },
  company_documents: { table: "company_documents", label: "Company documents (licences, policies)", area: "Documents", search: ["title", "category", "file_name"], order: "uploaded_at.desc", write: true, soft: true, fields: { category: COMPANY_DOC_CATEGORIES, title: "text", file_name: "text", drive_url: "url", notes: "long", expires_on: "date", storage_provider: "text" }, required: ["title"] },
  attachments: { table: "attachments", label: "Attachments on records", area: "Documents", search: ["file_name", "entity_ref"], order: "uploaded_at.desc", write: true, soft: false, fields: { entity_type: "text", entity_ref: "text", file_name: "text", url: "url" }, required: ["entity_type", "entity_ref", "file_name"] },
  employees: { table: "hr_employees", label: "Employees (HR)", area: "HR", search: ["full_name", "employee_code", "email", "job_title", "department"], order: "full_name", write: true, soft: true, fields: EMPLOYEE_FIELDS, required: ["employee_code", "full_name"], hide: ["basic_salary_enc", "iban_enc", "emirates_id_enc", "passport_no_enc", "national_id_enc"] },
  leave_requests: { table: "hr_leave_requests", label: "Leave requests (the AI cannot approve)", area: "HR", search: ["reason", "leave_type", "status"], order: "starts_on.desc", write: true, soft: false, fields: LEAVE_FIELDS, required: ["employee_id", "leave_type", "starts_on", "ends_on", "days"] },
  attendance: { table: "hr_attendance_days", label: "Attendance days", area: "HR", search: ["status", "notes"], order: "work_date.desc", write: true, soft: true, fields: { employee_id: "uuid", work_date: "date", status: ["present", "absent", "half", "leave", "holiday"], hours: "number", notes: "long" }, required: ["employee_id", "work_date"] },
  payroll_runs: { table: "payroll_runs", label: "Payroll runs (the AI keeps them draft)", area: "Payroll", search: ["period_yyyy_mm", "status", "notes"], order: "period_yyyy_mm.desc", write: false, soft: false, fields: {} },
  payroll_lines: { table: "payroll_lines", label: "Payroll lines (use update_payroll_line)", area: "Payroll", search: [], order: "created_at", write: false, soft: false, fields: {}, hide: ["pay_enc"] },
  users: { table: "app_users", label: "Team members and roles (read only)", area: "Admin", search: ["name", "email", "role"], order: "name", write: false, soft: false, fields: {} },
}
const ENTITY_NAMES = Object.keys(ENTITIES) as [string, ...string[]]
const entityArg = z.enum(ENTITY_NAMES).describe(
  "Which records. " + Object.entries(ENTITIES).map(([k, e]) => `${k} = ${e.label} [${e.area}]`).join("; "),
)

function entity(name: string): Entity {
  const e = ENTITIES[name]
  if (!e) throw new ToolError(`Unknown entity ${name}.`)
  return e
}

/** Strict check of a create/update body against the entity's fields. */
function validData(e: Entity, data: unknown, creating: boolean): Row {
  if (!e.write) throw new ToolError(`${e.label}: not changed with create_record / update_record.`)
  const schema = z.object(shapeOf(e.fields)).strict()
  const parsed = schema.safeParse(data ?? {})
  if (!parsed.success) {
    throw new ToolError(`Invalid fields for ${e.table}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "data"}: ${i.message}`).join("; ")}. Allowed: ${fieldList(e.fields)}`)
  }
  const out = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as Row
  if (!Object.keys(out).length) throw new ToolError("Nothing to save.")
  if (creating) {
    const missing = (e.required || []).filter((f) => out[f] == null || out[f] === "")
    if (missing.length) throw new ToolError(`Missing: ${missing.join(", ")}.`)
  }
  return out
}

function clean(e: Entity | null, row: Row | null): Row | null {
  if (!row) return row
  const out: Row = {}
  const hide = new Set([...(e?.hide || []), "image_data"])
  for (const [k, v] of Object.entries(row)) if (!hide.has(k) && !k.endsWith("_enc")) out[k] = v
  return out
}

// ---- Database calls ----------------------------------------------------------

async function rpc(ctx: ToolContext, fn: string, args: Row, what: string): Promise<unknown> {
  return check(await ctx.db.rpc(fn, args), what)
}

async function save(ctx: ToolContext, table: string, id: string | null, data: Row, tool: string, args: Row): Promise<Row> {
  return (await rpc(ctx, "rr_mcp_save", { p_table: table, p_id: id, p_data: data, p_tool: tool, p_args: args }, `save ${table}`)) as Row
}

async function getRow(ctx: ToolContext, table: string, id: string, what: string): Promise<Row> {
  const res = await ctx.db.from(table).select("*").eq("id", id).maybeSingle()
  const row = check(res, `read ${what}`) as Row | null
  if (!row) throw new ToolError(`No ${what} with id ${id} (or not visible to this key).`)
  return row
}

async function listRows(ctx: ToolContext, table: string, filter: (q: any) => any, order: string, limit: number, offset: number) {
  const [col, dir] = order.split(".")
  // deno-lint-ignore no-explicit-any
  let q: any = ctx.db.from(table).select("*")
  q = filter(q)
  q = q.order(col, { ascending: dir !== "desc", nullsFirst: false }).range(offset, offset + limit)
  const rows = (check(await q, `list ${table}`) as Row[] | null) || []
  return { items: rows.slice(0, limit), limit, offset, has_more: rows.length > limit, next_offset: rows.length > limit ? offset + limit : null }
}

const limitArg = z.number().int().min(1).max(50).optional().describe("Rows per page, 1 to 50 (default 20).")
const offsetArg = z.number().int().min(0).optional().describe("Rows to skip; use next_offset from the last answer.")
const vatArg = z.number().min(0).max(100).optional().describe("VAT percent (default 5, UAE).")
const lineArg = z.object({
  description: z.string().min(1).max(2000),
  quantity: z.number().positive().max(1e9),
  unit_price: z.number().min(0).max(1e12).describe("Price per unit before VAT, in the document currency."),
  discount_percent: z.number().min(0).max(100).optional().describe("Line discount, taken off the unit price."),
  unit_cost: z.number().min(0).max(1e12).optional().describe("Supplier cost per unit (for margin), optional."),
  remarks: z.string().max(500).optional(),
}).strict()
const linesArg = z.array(lineArg).min(1).max(200)

async function accountName(ctx: ToolContext, accountId: string): Promise<string> {
  const row = await getRow(ctx, "accounts", accountId, "account")
  return String(row.name || "")
}

function rate(v: unknown): number {
  try {
    return vatRateFromPercent(v as number | undefined) as number
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e))
  }
}

const PIPELINE_TABLE = { company: "crm", ai_crm: "sales_deals", ctrm_next: "ctrm_deals" } as const
const PIPELINE_ENTITY = { company: "company_deals", ai_crm: "ai_crm_deals", ctrm_next: "ctrm_deals" } as const
type Pipeline = keyof typeof PIPELINE_TABLE
const pipelineArg = z.enum(["company", "ai_crm", "ctrm_next"]).describe("company = company CRM, ai_crm = AI CRM, ctrm_next = CTRM Next.")
const stageColumn = (p: Pipeline) => (p === "company" ? "pipeline_stage" : "stage")

function quoteHeader(a: Row): Row {
  const h: Row = {}
  for (const k of ["client", "account_id", "date", "valid_until", "currency", "fx_rate", "description", "notes", "payment_terms",
    "delivery_terms", "moq", "contact_name", "contact_email", "contact_phone", "discount_percent", "discount_amount", "deal_ref"]) {
    if (a[k] !== undefined) h[k] = a[k]
  }
  if (a.division_code !== undefined) {
    h.division_code = a.division_code
    h.vertical = divisionVertical(String(a.division_code))
  }
  return h
}

const docHeaderShape = {
  date: date.optional().describe("Document date (default today)."),
  description: z.string().max(2000).optional(),
  notes: z.string().max(8000).optional(),
  payment_terms: z.string().max(500).optional(),
  delivery_terms: z.string().max(500).optional(),
  division_code: z.enum(DIVISION_CODES as [string, ...string[]]).optional().describe("01 RR Threads, 02 Wanders, 03 Marketing, 04 Connect, 05 Care, 06 Trading (default 01)."),
}

// ---- Tools -------------------------------------------------------------------

const W = (name: string, title: string, description: string, input: z.ZodRawShape, run: ToolDef["run"]): ToolDef =>
  ({ name, title, description, input, readOnly: false, run })
const R = (name: string, title: string, description: string, input: z.ZodRawShape, run: ToolDef["run"]): ToolDef =>
  ({ name, title, description, input, readOnly: true, run })

export const ADMIN_TOOLS: ToolDef[] = [
  // ---- Any area --------------------------------------------------------------
  R("list_records", "List records (any area)",
    "List records of any HighMast area: CRM, client accounts, quotes, invoices, payments, expenses, support, documents, delivery, operations, finance, HR, payroll and users. Optional text search, exact-match filters and paging. Deleted records are left out unless include_deleted is true.",
    {
      entity: entityArg,
      search: z.string().max(100).optional().describe("Text to look for in the main name / reference fields."),
      filters: z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional()
        .describe('Exact matches on columns, e.g. {"status":"open"} or {"account_id":"<uuid>"}.'),
      include_deleted: z.boolean().optional(),
      limit: limitArg,
      offset: offsetArg,
    },
    async (a, ctx) => {
      const e = entity(String(a.entity))
      const limit = Number(a.limit || 20), offset = Number(a.offset || 0)
      const filters = (a.filters || {}) as Row
      for (const k of Object.keys(filters)) if (!/^[a-z][a-z0-9_]{0,62}$/.test(k)) throw new ToolError(`Bad filter column ${k}.`)
      const page = await listRows(ctx, e.table, (q) => {
        for (const [k, v] of Object.entries(filters)) q = v === null ? q.is(k, null) : q.eq(k, v)
        if (e.soft && !a.include_deleted) q = q.is("deleted_at", null)
        const s = likeText(a.search, 100)
        if (s && e.search.length) q = q.or(e.search.map((c) => `${c}.ilike.%${s}%`).join(","))
        return q
      }, e.order, limit, offset)
      return { entity: a.entity, ...page, items: page.items.map((r) => clean(e, r)) }
    }),
  R("get_record", "Get one record (any area)", "One record of any entity by id, with all its fields.",
    { entity: entityArg, id: uuid },
    async (a, ctx) => {
      const e = entity(String(a.entity))
      return { entity: a.entity, record: clean(e, await getRow(ctx, e.table, String(a.id), e.label)) }
    }),
  W("create_record", "Create a record (any area)",
    "Create a record in an area that has no special tool (e.g. vendors, products, purchase_orders, delivery_projects, build_tasks, time_entries, contracts, clients, client_purchase_orders, warehouses, construction_sites, attendance). data must use only that entity's fields; the error lists them. Quotes, invoices, payments, expenses and payroll have their own tools.",
    { entity: entityArg, data: z.record(z.unknown()).describe("Field values for the new record.") },
    async (a, ctx) => {
      const e = entity(String(a.entity))
      const data = validData(e, a.data, true)
      return { created: true, entity: a.entity, record: clean(e, await save(ctx, e.table, null, data, "create_record", { entity: a.entity, data })) }
    }),
  W("update_record", "Update a record (any area)",
    "Change fields on a record (any entity that allows it). Only the fields you send change. Sent invoices, payments and payroll cannot be changed this way.",
    { entity: entityArg, id: uuid, data: z.record(z.unknown()).describe("Fields to change.") },
    async (a, ctx) => {
      const e = entity(String(a.entity))
      const data = validData(e, a.data, false)
      return { updated: true, entity: a.entity, record: clean(e, await save(ctx, e.table, String(a.id), data, "update_record", { entity: a.entity, id: a.id, data })) }
    }),
  W("delete_record", "Delete a record (soft, can be restored)",
    "Soft delete: hides the record everywhere in HighMast by setting deleted_at. Nothing is erased; restore_record brings it back. Only entities with soft delete (accounts, contacts, deals, quotes, draft invoices, expenses, tickets, documents, vendors, products, purchase orders, delivery projects, employees, attendance...). Sent invoices and payments cannot be deleted.",
    { entity: entityArg, id: uuid },
    async (a, ctx) => {
      const e = entity(String(a.entity))
      if (!e.soft) throw new ToolError(`${e.label} cannot be deleted from the AI connector.`)
      const row = await rpc(ctx, "rr_mcp_set_deleted", { p_table: e.table, p_id: a.id, p_deleted: true, p_tool: "delete_record", p_args: a }, "delete the record")
      return { deleted: true, restorable: true, entity: a.entity, record: clean(e, row as Row) }
    }),
  W("restore_record", "Restore a deleted record", "Undo delete_record: the record shows again in HighMast.",
    { entity: entityArg, id: uuid },
    async (a, ctx) => {
      const e = entity(String(a.entity))
      if (!e.soft) throw new ToolError(`${e.label} has no delete, so nothing to restore.`)
      const row = await rpc(ctx, "rr_mcp_set_deleted", { p_table: e.table, p_id: a.id, p_deleted: false, p_tool: "restore_record", p_args: a }, "restore the record")
      return { restored: true, entity: a.entity, record: clean(e, row as Row) }
    }),

  // ---- CRM ---------------------------------------------------------------------
  W("create_account", "Create an account", `Create a client or prospect account. Fields: ${fieldList(ACCOUNT_FIELDS)}. name and type are required.`,
    shapeOf(ACCOUNT_FIELDS),
    async (a, ctx) => ({ created: true, account: await save(ctx, "accounts", null, validData(ENTITIES.accounts, a, true), "create_account", a) })),
  W("update_account", "Update an account", "Change fields on an account. Only the fields you send change.",
    { account_id: uuid, ...shapeOf(ACCOUNT_FIELDS) },
    async (a, ctx) => {
      const { account_id, ...rest } = a
      return { updated: true, account: await save(ctx, "accounts", String(account_id), validData(ENTITIES.accounts, rest, false), "update_account", a) }
    }),
  W("create_contact", "Create a contact", `Add a contact person to an account. Fields: ${fieldList(CONTACT_FIELDS)}.`,
    shapeOf(CONTACT_FIELDS),
    async (a, ctx) => ({ created: true, contact: await save(ctx, "account_contacts", null, validData(ENTITIES.contacts, a, true), "create_contact", a) })),
  W("update_contact", "Update a contact", "Change a contact's details.",
    { contact_id: uuid, ...shapeOf(CONTACT_FIELDS) },
    async (a, ctx) => {
      const { contact_id, ...rest } = a
      return { updated: true, contact: await save(ctx, "account_contacts", String(contact_id), validData(ENTITIES.contacts, rest, false), "update_contact", a) }
    }),
  W("create_deal", "Create a deal (any pipeline)",
    `Create a deal. pipeline company: data uses ${fieldList(CRM_FIELDS)}. ai_crm: ${fieldList(SALES_FIELDS)}. ctrm_next: ${fieldList(CTRM_FIELDS)}. Open deals need next_action and its date (follow_up_date for company, next_action_date otherwise).`,
    { pipeline: pipelineArg, data: z.record(z.unknown()) },
    async (a, ctx) => {
      const p = a.pipeline as Pipeline
      const e = ENTITIES[PIPELINE_ENTITY[p]]
      return { created: true, pipeline: p, deal: await save(ctx, e.table, null, validData(e, a.data, true), "create_deal", a) }
    }),
  W("update_deal", "Update a deal (any pipeline)", "Change fields on a deal. Same fields as create_deal for that pipeline.",
    { pipeline: pipelineArg, deal_id: uuid, data: z.record(z.unknown()) },
    async (a, ctx) => {
      const p = a.pipeline as Pipeline
      const e = ENTITIES[PIPELINE_ENTITY[p]]
      return { updated: true, pipeline: p, deal: await save(ctx, e.table, String(a.deal_id), validData(e, a.data, false), "update_deal", a) }
    }),
  W("set_deal_stage", "Move a deal to any stage",
    `Move a deal forward or back. Stages: company ${PIPELINE_STAGES_COMPANY.join("|")}; ai_crm ${SALES_STAGES.join("|")}; ctrm_next ${CTRM_STAGES.join("|")}. To win or lose a deal use close_deal. Open stages need a next action and date (send them if the deal has none).`,
    {
      pipeline: pipelineArg, deal_id: uuid, stage: z.string().max(40),
      next_action: z.string().max(200).optional(), next_action_date: date.optional(),
    },
    async (a, ctx) => {
      const p = a.pipeline as Pipeline
      const stage = String(a.stage)
      const closing = ["won", "lost", "signed"].includes(stage.toLowerCase())
      if (closing) throw new ToolError("Use close_deal to win or lose a deal.")
      const data: Row = { [stageColumn(p)]: stage }
      if (a.next_action !== undefined) data.next_action = a.next_action
      if (a.next_action_date !== undefined) data[p === "company" ? "follow_up_date" : "next_action_date"] = a.next_action_date
      return { moved: true, pipeline: p, deal: await save(ctx, PIPELINE_TABLE[p], String(a.deal_id), data, "set_deal_stage", a) }
    }),
  W("close_deal", "Close a deal as won or lost",
    `Close a deal. won = Won (company) or signed (ai_crm, ctrm_next). lost needs lost_reason (${LOST_REASONS.join("|")}) and a lost_note, as HighMast asks people.`,
    {
      pipeline: pipelineArg, deal_id: uuid, outcome: z.enum(["won", "lost"]),
      lost_reason: z.enum(LOST_REASONS).optional(), lost_note: z.string().max(2000).optional(),
    },
    async (a, ctx) => {
      const p = a.pipeline as Pipeline
      const won = a.outcome === "won"
      if (!won && (!a.lost_reason || !String(a.lost_note || "").trim())) throw new ToolError("A lost deal needs lost_reason and lost_note.")
      const data: Row = p === "company"
        ? (won ? { pipeline_stage: "Won" } : { pipeline_stage: "Lost", outcome_reason: a.lost_reason, lost_note: a.lost_note })
        : (won ? { stage: "signed" } : { stage: "lost", lost_reason_code: a.lost_reason, lost_reason: a.lost_note })
      return { closed: true, outcome: a.outcome, pipeline: p, deal: await save(ctx, PIPELINE_TABLE[p], String(a.deal_id), data, "close_deal", a) }
    }),

  // ---- Quotes ------------------------------------------------------------------
  R("get_quote", "Get a quote with its lines", "A quotation with its line items.",
    { quote_id: uuid },
    async (a, ctx) => {
      const q = await getRow(ctx, "quotations", String(a.quote_id), "quote")
      const lines = check(await ctx.db.from("line_items").select("*").eq("doc_type", "Quote").eq("reference", String(q.quote_id || "")).order("line_no"), "read quote lines") as Row[]
      return { quote: q, lines: (lines || []).map((l) => clean(null, l)) }
    }),
  W("create_quote", "Create a quote (Draft)",
    "Create a Draft quotation with line items. VAT 5% UAE and currency AED by default. A line discount comes off that line's unit price. Returns the quote's id, its draft id (Q-...) and totals; the RR-XX-YYNNN quote number is given by finalize_quote, as in the app.",
    {
      account_id: uuid.optional().describe("The client account. The client name is taken from it if client is empty."),
      client: z.string().max(200).optional(),
      lines: linesArg,
      vat_percent: vatArg,
      currency: z.string().regex(/^[A-Z]{3}$/).optional().describe("Default AED."),
      fx_rate: z.number().positive().optional().describe("AED per 1 unit of currency; needed when currency is not AED."),
      valid_until: date.optional().describe("Validity date (default 14 days after the date)."),
      discount_percent: z.number().min(0).max(100).optional().describe("Whole-quote discount percent."),
      discount_amount: z.number().min(0).optional().describe("Whole-quote discount amount."),
      contact_name: z.string().max(200).optional(), contact_email: z.string().max(200).optional(), contact_phone: z.string().max(60).optional(),
      ...docHeaderShape,
    },
    async (a, ctx) => {
      const h = quoteHeader(a)
      if (!h.client && a.account_id) h.client = await accountName(ctx, String(a.account_id))
      if (!h.client) throw new ToolError("Give account_id or client.")
      if (!h.division_code) { h.division_code = "01"; h.vertical = divisionVertical("01") }
      const res = await rpc(ctx, "rr_mcp_quote_save", { p_id: null, p_header: h, p_lines: a.lines, p_vat_rate: rate(a.vat_percent), p_args: a }, "create the quote") as Row
      const q = res.quote as Row
      return { created: true, quote_id: q.id, draft_id: q.quote_id, quote_number: q.reference_number || null, status: q.status, totals: res.totals }
    }),
  W("update_quote", "Update a Draft quote", "Change a Draft quote. Send lines to replace all its lines; leave lines out to keep them. Finalized quotes cannot be edited.",
    {
      quote_id: uuid, lines: linesArg.optional(), vat_percent: vatArg,
      account_id: uuid.optional(), client: z.string().max(200).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      fx_rate: z.number().positive().optional(), valid_until: date.optional(),
      discount_percent: z.number().min(0).max(100).optional(), discount_amount: z.number().min(0).optional(),
      contact_name: z.string().max(200).optional(), contact_email: z.string().max(200).optional(), contact_phone: z.string().max(60).optional(),
      ...docHeaderShape,
    },
    async (a, ctx) => {
      const res = await rpc(ctx, "rr_mcp_quote_save", { p_id: a.quote_id, p_header: quoteHeader(a), p_lines: a.lines ?? null, p_vat_rate: rate(a.vat_percent), p_args: a }, "update the quote") as Row
      const q = res.quote as Row
      return { updated: true, quote_id: q.id, status: q.status, totals: res.totals }
    }),
  W("finalize_quote", "Finalize a quote", "Give a Draft quote its RR-XX-YYNNN number and status Finalized (then it can be sent or converted, and no longer edited).",
    { quote_id: uuid },
    async (a, ctx) => {
      const q = await rpc(ctx, "rr_mcp_quote_finalize", { p_id: a.quote_id, p_prefix: "RR", p_args: a }, "finalize the quote") as Row
      return { finalized: true, quote_id: q.id, quote_number: q.reference_number, total: q.amount, currency: q.quotation_currency || q.currency, valid_until: q.valid_until }
    }),
  W("mark_quote_sent", "Mark a quote as sent", "Record that a finalized quote was sent to the client (status Sent, sent date today). Does not email anything.",
    { quote_id: uuid },
    async (a, ctx) => {
      const q = await rpc(ctx, "rr_mcp_quote_mark_sent", { p_id: a.quote_id, p_args: a }, "mark the quote sent") as Row
      return { sent: true, quote_id: q.id, quote_number: q.reference_number, sent_at: q.sent_at }
    }),
  W("convert_quote_to_invoice", "Convert a quote to an invoice",
    "Create the invoice for a finalized quote, like the Convert to invoice button: same number, status Sent, payment Pending. percent < 100 makes a deposit invoice. The invoice is then locked.",
    { quote_id: uuid, percent: z.number().min(1).max(100).optional().describe("Deposit percent (default 100 = full amount).") },
    async (a, ctx) => {
      const res = await rpc(ctx, "rr_mcp_quote_to_invoice", { p_id: a.quote_id, p_percent: a.percent ?? 100, p_args: a }, "convert the quote") as Row
      const inv = res.invoice as Row
      return { created: true, invoice_id: inv.id, invoice_number: inv.reference_number, status: inv.status, totals: res.totals }
    }),

  // ---- Invoices and payments -------------------------------------------------------
  R("get_invoice", "Get an invoice", "An invoice (or credit note) with its lines, payments and the balance due.",
    { invoice_id: uuid },
    async (a, ctx) => {
      const inv = await getRow(ctx, "invoices", String(a.invoice_id), "invoice")
      const ref = String(inv.reference_number || "")
      const lines = check(await ctx.db.from("line_items").select("*").eq("doc_type", "Invoice").eq("reference", ref).order("line_no"), "read invoice lines") as Row[]
      const pays = check(await ctx.db.from("payment_log").select("*").eq("invoice_ref", ref).order("created_at"), "read payments") as Row[]
      const balance = await rpc(ctx, "rr_mcp_invoice_balance", { p_invoice_id: a.invoice_id }, "work out the balance")
      return { invoice: inv, lines: (lines || []).map((l) => clean(null, l)), payments: pays || [], balance }
    }),
  W("create_invoice", "Create an invoice",
    "Create an invoice with lines (VAT 5% and AED by default). It stays Draft (temporary INV-DRAFT number, editable) unless finalize is true, which gives it its RR number and status Sent; a sent invoice is locked.",
    {
      account_id: uuid.optional(), client: z.string().max(200).optional(), lines: linesArg, vat_percent: vatArg,
      currency: z.string().regex(/^[A-Z]{3}$/).optional(), moq: z.string().max(200).optional(),
      finalize: z.boolean().optional(), ...docHeaderShape,
    },
    async (a, ctx) => {
      const h = quoteHeader(a)
      if (!h.client && a.account_id) h.client = await accountName(ctx, String(a.account_id))
      if (!h.client) throw new ToolError("Give account_id or client.")
      if (!h.division_code) { h.division_code = "01"; h.vertical = divisionVertical("01") }
      const res = await rpc(ctx, "rr_mcp_invoice_save", { p_id: null, p_header: h, p_lines: a.lines, p_vat_rate: rate(a.vat_percent), p_finalize: !!a.finalize, p_args: a }, "create the invoice") as Row
      const inv = res.invoice as Row
      return { created: true, invoice_id: inv.id, invoice_number: inv.reference_number, status: inv.status, totals: res.totals }
    }),
  W("update_invoice", "Update a Draft invoice", "Change a Draft invoice (send lines to replace them). Sent invoices cannot be changed; use create_credit_note.",
    {
      invoice_id: uuid, lines: linesArg.optional(), vat_percent: vatArg, client: z.string().max(200).optional(),
      account_id: uuid.optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), moq: z.string().max(200).optional(), ...docHeaderShape,
    },
    async (a, ctx) => {
      const res = await rpc(ctx, "rr_mcp_invoice_save", { p_id: a.invoice_id, p_header: quoteHeader(a), p_lines: a.lines ?? null, p_vat_rate: rate(a.vat_percent), p_finalize: false, p_args: a }, "update the invoice") as Row
      const inv = res.invoice as Row
      return { updated: true, invoice_id: inv.id, invoice_number: inv.reference_number, status: inv.status, totals: res.totals }
    }),
  W("finalize_invoice", "Finalize an invoice", "Give a Draft invoice its RR-XX-YYNNN number and status Sent. After this it is locked.",
    { invoice_id: uuid, vat_percent: vatArg },
    async (a, ctx) => {
      const res = await rpc(ctx, "rr_mcp_invoice_save", { p_id: a.invoice_id, p_header: {}, p_lines: null, p_vat_rate: rate(a.vat_percent), p_finalize: true, p_args: a }, "finalize the invoice") as Row
      const inv = res.invoice as Row
      return { finalized: true, invoice_id: inv.id, invoice_number: inv.reference_number, status: inv.status, totals: res.totals }
    }),
  W("record_payment", "Record a payment on an invoice",
    "Record money received against an invoice. Updates its payment status (Partial / Paid) and the income ledger. Cannot be more than the balance due. A recorded payment can never be edited; use reverse_payment to correct it.",
    {
      invoice_id: uuid, amount: z.number().positive().max(1e12), date: date.optional().describe("Day the money arrived (default today)."),
      method: z.string().min(1).max(60).describe("e.g. Bank transfer, Cash, Cheque, Card."), reference: z.string().max(120).optional().describe("Bank or cheque reference."),
      notes: z.string().max(1000).optional(),
    },
    async (a, ctx) => rpc(ctx, "rr_mcp_record_payment", {
      p_invoice_id: a.invoice_id, p_amount: a.amount, p_date: a.date ?? null, p_method: a.method, p_reference: a.reference ?? "", p_notes: a.notes ?? "", p_args: a,
    }, "record the payment")),
  W("reverse_payment", "Reverse a payment", "Correct a wrong or bounced payment: adds a matching negative entry (the original stays) and updates the invoice's payment status.",
    { payment_id: uuid, reason: z.string().min(3).max(500) },
    async (a, ctx) => rpc(ctx, "rr_mcp_reverse_payment", { p_payment_id: a.payment_id, p_reason: a.reason, p_args: a }, "reverse the payment")),
  W("create_credit_note", "Create a credit note", "Correct a sent invoice: a credit note {invoice number}-CN{n} for an amount including VAT, at most the invoice total less earlier credit notes. Lowers the balance due.",
    { invoice_id: uuid, amount: z.number().positive().max(1e12).describe("Amount to credit, VAT included."), reason: z.string().min(3).max(500) },
    async (a, ctx) => rpc(ctx, "rr_mcp_credit_note", { p_invoice_id: a.invoice_id, p_amount: a.amount, p_reason: a.reason, p_args: a }, "create the credit note")),
  W("create_expense", "Create an expense", "Record an expense. Give amount_ex_vat; VAT (5% by default) and the total are worked out.",
    {
      amount_ex_vat: z.number().min(0).max(1e12), vat_percent: vatArg, date: date, vendor: z.string().min(1).max(200),
      category: z.string().min(1).max(100), payment_method: z.string().max(60).optional(), supplier_invoice_no: z.string().max(100).optional(),
      quote_ref: z.string().max(60).optional(), references_text: z.string().max(500).optional(), notes: z.string().max(2000).optional(),
      status: z.enum(EXPENSE_STATUSES).optional().describe("Default Recorded."),
    },
    async (a, ctx) => {
      const { amount_ex_vat, vat_percent, ...rest } = a
      const money = expenseAmounts(Number(amount_ex_vat), vat_percent as number | undefined) as Row
      const data = { ...rest, status: rest.status || "Recorded", ...money }
      return { created: true, expense: await save(ctx, "expenses", null, data, "create_expense", a) }
    }),
  W("update_expense", "Update an expense", "Change an expense. Send amount_ex_vat (and vat_percent) to change the money; the total is worked out.",
    {
      expense_id: uuid, amount_ex_vat: z.number().min(0).max(1e12).optional(), vat_percent: vatArg, ...shapeOf(EXPENSE_FIELDS),
    },
    async (a, ctx) => {
      const { expense_id, amount_ex_vat, vat_percent, ...rest } = a
      const data: Row = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
      if (amount_ex_vat !== undefined) Object.assign(data, expenseAmounts(Number(amount_ex_vat), vat_percent as number | undefined))
      if (!Object.keys(data).length) throw new ToolError("Nothing to change.")
      return { updated: true, expense: await save(ctx, "expenses", String(expense_id), data, "update_expense", a) }
    }),

  // ---- Support desk ------------------------------------------------------------
  W("create_ticket", "Create a support ticket", "Open a support ticket, optionally with its first message.",
    {
      subject: z.string().min(1).max(300), account_id: uuid.optional(), requester_email: z.string().max(200).optional(),
      channel: z.enum(TICKET_CHANNELS).optional().describe("Default internal."), priority: z.enum(TICKET_PRIORITIES).optional().describe("Default normal."),
      assignee_user_id: uuid.optional(), message: z.string().max(8000).optional(),
    },
    async (a, ctx) => {
      const data: Row = { subject: a.subject, channel: a.channel || "internal", priority: a.priority || "normal", status: "new" }
      for (const k of ["account_id", "requester_email", "assignee_user_id"]) if (a[k] !== undefined) data[k] = a[k]
      const t = await save(ctx, "tickets", null, data, "create_ticket", a)
      let message: Row | null = null
      if (a.message) message = await addMessage(ctx, String(t.id), String(a.message), false, a)
      return { created: true, ticket: t, message }
    }),
  W("update_ticket", "Update a support ticket", "Change a ticket's status, priority, assignee, subject or vendor fields.",
    { ticket_id: uuid, ...shapeOf(TICKET_FIELDS) },
    async (a, ctx) => {
      const { ticket_id, ...rest } = a
      return { updated: true, ticket: await save(ctx, "tickets", String(ticket_id), validData(ENTITIES.tickets, rest, false), "update_ticket", a) }
    }),
  W("reply_ticket", "Reply on a support ticket", "Add a reply (or an internal note) to a ticket, as the AI Assistant. The reply is saved on the ticket; it is not emailed from here.",
    { ticket_id: uuid, body: z.string().min(1).max(8000), internal_note: z.boolean().optional() },
    async (a, ctx) => ({ added: true, message: await addMessage(ctx, String(a.ticket_id), String(a.body), !!a.internal_note, a) })),
  W("close_ticket", "Close a support ticket", "Set a ticket to resolved (default) or closed.",
    { ticket_id: uuid, status: z.enum(["resolved", "closed"]).optional() },
    async (a, ctx) => ({ closed: true, ticket: await save(ctx, "tickets", String(a.ticket_id), { status: a.status || "resolved" }, "close_ticket", a) })),

  // ---- Documents ----------------------------------------------------------------
  W("add_document", "Add a document link", "Register a document by its link (Google Drive or other URL): client documents (kind client) or company documents (kind company). The file itself is not uploaded from here.",
    {
      kind: z.enum(["client", "company"]), title: z.string().min(1).max(300), url: z.string().url().max(2000),
      category: z.string().max(100).optional().describe(`Free text for client documents; for company documents one of ${COMPANY_DOC_CATEGORIES.join("|")} (default other).`),
      file_name: z.string().max(300).optional(), notes: z.string().max(2000).optional(),
      company_name: z.string().max(200).optional().describe("Client documents: the client."), related_ref: z.string().max(100).optional().describe("Client documents: a quote or invoice number."),
      expires_on: date.optional().describe("Company documents: expiry date (licences)."),
    },
    async (a, ctx) => {
      const base: Row = { title: a.title, drive_url: a.url, category: a.category ?? "", file_name: a.file_name ?? "", notes: a.notes ?? "", storage_provider: "link" }
      if (a.kind === "client") {
        const data = { ...base, company_name: a.company_name ?? "", related_ref: a.related_ref ?? "" }
        return { created: true, document: await save(ctx, "customer_documents", null, data, "add_document", a) }
      }
      const category = String(a.category || "other")
      if (!(COMPANY_DOC_CATEGORIES as readonly string[]).includes(category)) throw new ToolError(`Company document category must be one of ${COMPANY_DOC_CATEGORIES.join(", ")}.`)
      const data = { ...base, category, ...(a.expires_on ? { expires_on: a.expires_on } : {}) }
      return { created: true, document: await save(ctx, "company_documents", null, data, "add_document", a) }
    }),

  // ---- HR ---------------------------------------------------------------------------
  R("list_employees", "List employees", "Employees with job, department and status. Search by name, code, email, job or department.",
    { search: z.string().max(100).optional(), employment_status: z.enum(["active", "onboarding", "leave", "exited"]).optional(), limit: limitArg, offset: offsetArg },
    async (a, ctx) => {
      const e = ENTITIES.employees
      const page = await listRows(ctx, e.table, (q) => {
        q = q.is("deleted_at", null)
        if (a.employment_status) q = q.eq("employment_status", a.employment_status)
        const s = likeText(a.search, 100)
        if (s) q = q.or(e.search.map((c) => `${c}.ilike.%${s}%`).join(","))
        return q
      }, e.order, Number(a.limit || 20), Number(a.offset || 0))
      return { ...page, items: page.items.map((r) => clean(e, r)) }
    }),
  R("get_employee", "Get an employee", "One employee with salary and IBAN (decrypted by HighMast when encryption is on) and masked ID numbers.",
    { employee_id: uuid },
    async (a, ctx) => {
      const row = await getRow(ctx, "hr_employees", String(a.employee_id), "employee")
      const sensitive = await ctx.db.rpc("rr_hr_sensitive", { p_employee_id: a.employee_id })
      const masked = await ctx.db.rpc("rr_hr_masked", { p_employee: a.employee_id })
      return { employee: clean(ENTITIES.employees, row), pay_and_bank: sensitive.error ? null : sensitive.data, id_numbers_masked: masked.error ? null : masked.data }
    }),
  W("create_employee", "Create an employee", `Add an employee. Fields: ${fieldList(EMPLOYEE_FIELDS)}. employee_code and full_name are required. Salary and IBAN are encrypted by HighMast.`,
    shapeOf(EMPLOYEE_FIELDS),
    async (a, ctx) => ({ created: true, employee: clean(ENTITIES.employees, await save(ctx, "hr_employees", null, validData(ENTITIES.employees, a, true), "create_employee", a)) })),
  W("update_employee", "Update an employee", "Change an employee's details, job, status, salary or bank details.",
    { employee_id: uuid, ...shapeOf(EMPLOYEE_FIELDS) },
    async (a, ctx) => {
      const { employee_id, ...rest } = a
      return { updated: true, employee: clean(ENTITIES.employees, await save(ctx, "hr_employees", String(employee_id), validData(ENTITIES.employees, rest, false), "update_employee", a)) }
    }),
  W("create_leave_request", "Create a leave request", "Add a leave request (status pending). A manager approves or rejects it in HighMast; the AI cannot.",
    {
      employee_id: uuid, leave_type: z.enum(["annual", "sick", "unpaid", "other"]), starts_on: date, ends_on: date,
      days: z.number().positive().max(366), reason: z.string().max(2000).optional(),
    },
    async (a, ctx) => ({ created: true, leave: await save(ctx, "hr_leave_requests", null, { ...a, status: "pending" }, "create_leave_request", a) })),
  W("update_leave_request", "Update a leave request", "Change dates, type or reason of a leave request, or cancel it (status canceled). Cannot approve or reject.",
    { leave_id: uuid, ...shapeOf(LEAVE_FIELDS) },
    async (a, ctx) => {
      const { leave_id, ...rest } = a
      return { updated: true, leave: await save(ctx, "hr_leave_requests", String(leave_id), validData(ENTITIES.leave_requests, rest, false), "update_leave_request", a) }
    }),

  // ---- Payroll (draft only) ----------------------------------------------------------
  W("create_payroll_run", "Create a draft payroll run", "Start a payroll run for a month (status draft). A person approves and pays it in HighMast; the AI never can.",
    { period_yyyy_mm: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM"), notes: z.string().max(2000).optional() },
    async (a, ctx) => ({ created: true, payroll_run: await save(ctx, "payroll_runs", null, { period_yyyy_mm: a.period_yyyy_mm, status: "draft", notes: a.notes ?? "" }, "create_payroll_run", a) })),
  W("generate_payroll_lines", "Calculate a draft payroll run", "Fill a draft run with one line per active employee from their salary and allowances (HighMast's own calculation).",
    { run_id: uuid },
    async (a, ctx) => {
      const before = await getRow(ctx, "payroll_runs", String(a.run_id), "payroll run")
      if (before.status !== "draft") throw new ToolError("Only draft payroll runs can be calculated.")
      const out = await rpc(ctx, "rr_payroll_generate_lines", { p_run: a.run_id }, "calculate the payroll run")
      await rpc(ctx, "rr_mcp_log_write", { p_tool: "generate_payroll_lines", p_args: a, p_table: "payroll_runs", p_record_id: a.run_id, p_before: before, p_after: { result: out } }, "log the payroll calculation")
      return { calculated: true, run_id: a.run_id, result: out }
    }),
  W("update_payroll_line", "Change a draft payroll line", "Change basic, allowances or deductions on one line of a draft run (HighMast recalculates net).",
    { line_id: uuid, basic_aed: z.number().min(0).optional(), allowances_aed: z.number().min(0).optional(), deductions_aed: z.number().min(0).optional() },
    async (a, ctx) => {
      const before = await getRow(ctx, "payroll_lines", String(a.line_id), "payroll line")
      const after = await rpc(ctx, "rr_payroll_update_line", { p_line: a.line_id, p_basic: a.basic_aed ?? null, p_allowances: a.allowances_aed ?? null, p_deductions: a.deductions_aed ?? null }, "change the payroll line") as Row
      await rpc(ctx, "rr_mcp_log_write", { p_tool: "update_payroll_line", p_args: a, p_table: "payroll_lines", p_record_id: a.line_id, p_before: before, p_after: after }, "log the payroll change")
      return { updated: true, line: clean(ENTITIES.payroll_lines, after) }
    }),
  R("get_payroll_run", "Get a payroll run", "A payroll run with its lines and totals.",
    { run_id: uuid },
    async (a, ctx) => {
      const run = await getRow(ctx, "payroll_runs", String(a.run_id), "payroll run")
      const lines = check(await ctx.db.from("payroll_lines").select("*").eq("run_id", String(a.run_id)), "read payroll lines") as Row[]
      const totals = await ctx.db.rpc("rr_payroll_run_totals", { p_run: a.run_id })
      return { run, lines: (lines || []).map((l) => clean(ENTITIES.payroll_lines, l)), totals: totals.error ? null : totals.data }
    }),

  // ---- Admin (read only) -------------------------------------------------------------
  R("list_users", "List team members and roles", "HighMast team members with their role and whether they are active. Read only: users and roles are changed by a person in Settings.",
    { role: z.enum(["admin", "manager", "sales", "staff", "viewer"]).optional(), active: z.boolean().optional(), limit: limitArg, offset: offsetArg },
    async (a, ctx) => {
      let q = ctx.db.from("app_users").select("id, name, email, role, active").order("name")
      if (a.role) q = q.eq("role", a.role)
      if (a.active !== undefined) q = q.eq("active", a.active)
      const limit = Number(a.limit || 20), offset = Number(a.offset || 0)
      const rows = (check(await q.range(offset, offset + limit), "list users") as Row[] | null) || []
      return { items: rows.slice(0, limit), limit, offset, has_more: rows.length > limit, next_offset: rows.length > limit ? offset + limit : null }
    }),
]

async function addMessage(ctx: ToolContext, ticketId: string, body: string, internal: boolean, args: Row): Promise<Row> {
  return await save(ctx, "ticket_messages", null, {
    ticket_id: ticketId,
    author_kind: "user",
    author_user_id: ctx.key.memberId,
    author_label: ctx.key.memberName,
    body,
    is_internal_note: internal,
  }, internal ? "ticket_note" : "reply_ticket", args)
}

export function registerAdminTools(server: McpServer, ctx: ToolContext) {
  if (ctx.key.scope !== "admin") return
  for (const def of ADMIN_TOOLS) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: {
          readOnlyHint: def.readOnly,
          // Nothing is ever erased: delete_record is a soft delete that restore_record undoes.
          destructiveHint: false,
          idempotentHint: def.readOnly,
          openWorldHint: false,
        },
      },
      // deno-lint-ignore no-explicit-any
      ((args: Record<string, unknown>) => runTool(def, args || {}, ctx)) as any,
    )
  }
}
