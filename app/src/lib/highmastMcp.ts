/**
 * Rules for the HighMast MCP server (Edge Function `highmast-mcp`), the
 * connector AI assistants such as Grok Bot use. Bundled into the function by
 * scripts/build-support-function.mjs, so the app, the tests and the server
 * agree on stages, overdue invoices, stale deals and ticket reply times.
 *
 * Safety lives in three places: the tool list below (no delete, HR, payroll,
 * secrets, settings or users tools), the role the key acts as (normal row
 * level security), and the "MCP ..." database policies
 * (supabase/migrations/20261323090000_highmast_mcp.sql).
 */
import { DIVISIONS, PIPELINE_STAGES } from './config'
import { roundAmount } from './money/index'
import { invoiceDueDate, isCollectible } from './contractBilling'
import { CTRM_STAGES, isOpenDeal } from './ctrm'
import { ACCOUNT_TYPES, nextAccountReference } from './accounts'
import { isOpenSalesDeal, SALES_STAGES } from './salesPipeline'
import { slaState } from './sla'
import { isOpenTicket } from './support'
import { DEFAULT_STALE_DAYS } from './watchdog'

export { nextAccountReference, invoiceDueDate, isCollectible, isOpenSalesDeal, isOpenDeal, isOpenTicket, slaState }
// Overdue invoice chasing (aging buckets, promises, next chase action): the same rules as the app.
export {
  agingSummary,
  agingTotalsByCurrency,
  buildAgingRows,
  CHASE_CHANNEL_VALUES,
  chaseSettingsFrom,
  filterAgingRows,
  AGING_BUCKET_KEYS,
} from './arChase'

/** Every tool the server offers. A test fails if anything risky sneaks in. */
export const MCP_READ_TOOLS = [
  'search_accounts',
  'get_account',
  'list_deals',
  'get_deal',
  'list_follow_ups_due',
  'list_tickets',
  'get_ticket',
  'list_quotes',
  'list_invoices',
  'dashboard_summary',
  'list_invoice_aging',
] as const
export const MCP_WRITE_TOOLS = [
  'create_lead',
  'add_timeline_note',
  'move_deal_stage',
  'create_follow_up',
  // Overdue invoice chasing: a chase note never changes the invoice or its money.
  'add_invoice_chase_note',
  'complete_invoice_chase_task',
  // Quote notes: append-only, never changes the quote, its lines or totals.
  'add_quote_note',
] as const
export const MCP_TOOLS = [...MCP_READ_TOOLS, ...MCP_WRITE_TOOLS] as const
export type McpToolName = (typeof MCP_TOOLS)[number]

/** Words no tool name may contain. */
export const FORBIDDEN_TOOL_WORDS = [
  'delete', 'remove', 'destroy', 'purge', 'archive', 'drop',
  'hr', 'payroll', 'salary', 'salaries', 'iban', 'passport', 'emirates_id', 'id_number',
  'secret', 'setting', 'settings', 'user', 'users', 'password', 'key', 'keys',
  'payment', 'pay', 'paid', 'refund',
] as const

/** Problem with a tool name, or null when it is allowed. */
export function toolNameProblem(name: string): string | null {
  const parts = name.toLowerCase().split(/[^a-z0-9]+/)
  for (const w of FORBIDDEN_TOOL_WORDS) {
    if (w.includes('_') ? name.toLowerCase().includes(w) : parts.includes(w)) return `tool "${name}" touches "${w}"`
  }
  return null
}

/**
 * Admin scope (Alfred, 2026-11-20): extra tools for a key that acts as a
 * dedicated "AI Assistant" admin member. They cover every area, HR and payroll
 * included, but: deletes are soft (restore_record undoes them), sent invoices
 * and recorded payments are only corrected by a credit note or a reversal,
 * payroll stays draft, and users are read only. Standard keys never get these.
 */
export const MCP_ADMIN_TOOLS = [
  // Any area
  'list_records', 'get_record', 'create_record', 'update_record', 'delete_record', 'restore_record',
  // CRM
  'create_account', 'update_account', 'create_contact', 'update_contact',
  'create_deal', 'update_deal', 'set_deal_stage', 'close_deal',
  // Quotes, invoices, payments, expenses
  'get_quote', 'create_quote', 'update_quote', 'finalize_quote', 'mark_quote_sent', 'convert_quote_to_invoice',
  'revise_quote', 'extend_quote_validity',
  'get_invoice', 'create_invoice', 'update_invoice', 'finalize_invoice',
  'record_payment', 'reverse_payment', 'create_credit_note', 'create_expense', 'update_expense',
  // Support desk
  'create_ticket', 'update_ticket', 'reply_ticket', 'close_ticket',
  // Documents
  'add_document',
  // HR and payroll (payroll draft only)
  'list_employees', 'get_employee', 'create_employee', 'update_employee',
  'create_leave_request', 'update_leave_request',
  'create_payroll_run', 'generate_payroll_lines', 'update_payroll_line', 'get_payroll_run',
  // Admin (read only)
  'list_users',
] as const
export type McpAdminToolName = (typeof MCP_ADMIN_TOOLS)[number]

/** Words no admin tool name may contain: nothing approves, pays out, hard deletes or touches secrets. */
export const FORBIDDEN_ADMIN_TOOL_WORDS = [
  'approve', 'approval', 'purge', 'destroy', 'drop', 'hard', 'secret', 'setting', 'settings',
  'password', 'key', 'keys', 'payout', 'wps', 'refund', 'role',
] as const

export function adminToolNameProblem(name: string): string | null {
  const parts = name.toLowerCase().split(/[^a-z0-9]+/)
  for (const w of FORBIDDEN_ADMIN_TOOL_WORDS) if (parts.includes(w)) return `admin tool "${name}" touches "${w}"`
  return null
}

export const MCP_KEY_SCOPES = ['standard', 'admin'] as const
export type McpKeyScope = (typeof MCP_KEY_SCOPES)[number]

/** Which AI assistant a key is for (mcp_keys.assistant). */
export const MCP_ASSISTANTS = [
  { value: 'grok', label: 'Grok Bot' },
  { value: 'claude', label: 'Claude' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'other', label: 'Other' },
] as const
export type McpAssistant = (typeof MCP_ASSISTANTS)[number]['value']
export function assistantLabel(value: string | null | undefined): string {
  return MCP_ASSISTANTS.find((a) => a.value === value)?.label || ''
}

/**
 * Departments a key with departments (scope admin) can be given. Must match
 * public.rr_mcp_department_list() in 20261325090000_highmast_mcp_departments.sql,
 * which also decides, table by table, what each department may read and write.
 */
export const MCP_DEPARTMENTS = [
  { value: 'sales', label: 'Sales', hint: 'Accounts, contacts, deals in every pipeline, quotes' },
  { value: 'marketing', label: 'Marketing', hint: 'Campaigns, segments, website enquiries, accounts and contacts' },
  { value: 'finance', label: 'Finance', hint: 'Invoices, payments, credit notes, expenses, income, contracts' },
  { value: 'hr', label: 'HR', hint: 'Employees, leave requests, attendance' },
  { value: 'payroll', label: 'Payroll', hint: 'Draft payroll runs and lines (never approved or paid)' },
  { value: 'operations', label: 'Operations', hint: 'Suppliers, purchase orders, products, stock, sites, delivery' },
  { value: 'support', label: 'Support', hint: 'Tickets and replies' },
  { value: 'documents', label: 'Documents', hint: 'Client and company documents, attachments' },
  { value: 'admin', label: 'Admin (everything)', hint: 'Every area above plus the user list' },
] as const
export type McpDepartment = (typeof MCP_DEPARTMENTS)[number]['value']
export const MCP_DEPARTMENT_VALUES = MCP_DEPARTMENTS.map((d) => d.value) as McpDepartment[]

/**
 * Which departments get each tool. "admin" gets every tool. The generic
 * record tools (list_records ...) are offered to every department, limited to
 * the records that department reaches. The database checks every table again.
 */
const ALL_DEPTS: McpDepartment[] = ['sales', 'marketing', 'finance', 'hr', 'payroll', 'operations', 'support', 'documents']
const ACCOUNT_READERS: McpDepartment[] = ['sales', 'marketing', 'finance', 'operations', 'support', 'documents']
export const MCP_TOOL_DEPARTMENTS: Record<string, McpDepartment[]> = {
  // The standard tools
  search_accounts: ACCOUNT_READERS,
  get_account: ACCOUNT_READERS,
  list_deals: ['sales'],
  get_deal: ['sales'],
  list_follow_ups_due: ['sales'],
  list_tickets: ['support'],
  get_ticket: ['support'],
  list_quotes: ['sales', 'finance'],
  list_invoices: ['finance', 'sales'],
  dashboard_summary: ['sales', 'finance'],
  create_lead: ['sales'],
  add_timeline_note: ['sales', 'marketing', 'support'],
  move_deal_stage: ['sales'],
  create_follow_up: ['sales'],
  // Overdue invoice chasing (whoever reads invoices)
  list_invoice_aging: ['finance', 'sales'],
  add_invoice_chase_note: ['finance', 'sales'],
  complete_invoice_chase_task: ['finance', 'sales'],
  // Quote notes (whoever reads quotes)
  add_quote_note: ['sales', 'finance'],
  // Any area (narrowed to the department's records)
  list_records: ALL_DEPTS,
  get_record: ALL_DEPTS,
  create_record: ALL_DEPTS,
  update_record: ALL_DEPTS,
  delete_record: ALL_DEPTS,
  restore_record: ALL_DEPTS,
  // CRM
  create_account: ['sales', 'marketing'],
  update_account: ['sales', 'marketing'],
  create_contact: ['sales', 'marketing'],
  update_contact: ['sales', 'marketing'],
  create_deal: ['sales'],
  update_deal: ['sales'],
  set_deal_stage: ['sales'],
  close_deal: ['sales'],
  // Quotes
  get_quote: ['sales', 'finance'],
  create_quote: ['sales'],
  update_quote: ['sales'],
  finalize_quote: ['sales'],
  mark_quote_sent: ['sales'],
  revise_quote: ['sales'],
  extend_quote_validity: ['sales'],
  convert_quote_to_invoice: ['finance'],
  // Invoices and money
  get_invoice: ['finance'],
  create_invoice: ['finance'],
  update_invoice: ['finance'],
  finalize_invoice: ['finance'],
  record_payment: ['finance'],
  reverse_payment: ['finance'],
  create_credit_note: ['finance'],
  create_expense: ['finance'],
  update_expense: ['finance'],
  // Support
  create_ticket: ['support'],
  update_ticket: ['support'],
  reply_ticket: ['support'],
  close_ticket: ['support'],
  // Documents
  add_document: ['documents'],
  // HR
  list_employees: ['hr', 'payroll'],
  get_employee: ['hr', 'payroll'],
  create_employee: ['hr'],
  update_employee: ['hr'],
  create_leave_request: ['hr'],
  update_leave_request: ['hr'],
  // Payroll (draft only)
  create_payroll_run: ['payroll'],
  generate_payroll_lines: ['payroll'],
  update_payroll_line: ['payroll'],
  get_payroll_run: ['payroll'],
  // Admin
  list_users: [],
  // PDFs (read only; the document's own rules decide what a key can see)
  get_quote_pdf: ['sales', 'finance'],
  get_invoice_pdf: ['finance', 'sales'],
  get_delivery_note_pdf: ['operations'],
}

/** Read-only PDF tools, offered to standard keys and to keys whose departments see the document. */
export const MCP_PDF_TOOLS = ['get_quote_pdf', 'get_invoice_pdf', 'get_delivery_note_pdf'] as const

/** Clean list of departments: known values only, no repeats, in the standard order. */
export function normalizeDepartments(list: readonly string[] | null | undefined): McpDepartment[] {
  const set = new Set((list || []).map((d) => String(d).toLowerCase()))
  return MCP_DEPARTMENT_VALUES.filter((d) => set.has(d))
}

/** Does a key with these departments get this tool? Unknown tools: only "admin". */
export function toolAllowedForDepartments(tool: string, departments: readonly string[]): boolean {
  const depts = normalizeDepartments(departments)
  if (depts.includes('admin')) return true
  const allowed = MCP_TOOL_DEPARTMENTS[tool] || []
  return depts.some((d) => allowed.includes(d))
}

/** The tools (standard and admin) a key with these departments gets. */
export function toolsForDepartments(departments: readonly string[]): string[] {
  return [...MCP_TOOLS, ...MCP_ADMIN_TOOLS, ...MCP_PDF_TOOLS].filter((t) => toolAllowedForDepartments(t, departments))
}

/** Short text for a key's departments, e.g. "Sales, Finance". */
export function departmentsLabel(departments: readonly string[] | null | undefined): string {
  const depts = normalizeDepartments(departments)
  if (depts.includes('admin')) return 'Admin (everything)'
  return depts.map((d) => MCP_DEPARTMENTS.find((x) => x.value === d)?.label || d).join(', ')
}

/** Brand name the app stores in `vertical` for a division code ('01' -> 'RR Threads'). */
export function divisionVertical(code: string | null | undefined): string {
  const c = String(code || '01').padStart(2, '0')
  return DIVISIONS.find((d) => d.code === c)?.brand || ''
}
export const DIVISION_CODES = DIVISIONS.map((d) => d.code)

/** UAE VAT is 5%; tools take a percent and the database a rate. */
export const UAE_VAT_PERCENT = 5
export function vatRateFromPercent(percent: number | null | undefined): number {
  const p = percent == null ? UAE_VAT_PERCENT : Number(percent)
  if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error('vat_percent must be between 0 and 100')
  return Math.round(p * 1000) / 100000
}

/** Expense amounts from the amount before VAT, rounded like the app's money. */
export function expenseAmounts(amountExVat: number, vatPercent: number | null | undefined = UAE_VAT_PERCENT) {
  const ex = roundAmount(Number(amountExVat) || 0, 'AED')
  const vat = roundAmount(ex * vatRateFromPercent(vatPercent), 'AED')
  return { amount_ex_vat: ex, vat_amount: vat, amount: roundAmount(ex + vat, 'AED') }
}

/** Only these roles can be given to a key. Admin and manager are refused on purpose. */
export const MCP_KEY_ROLES = ['sales', 'staff', 'viewer'] as const
export type McpKeyRole = (typeof MCP_KEY_ROLES)[number]
export const MCP_DEFAULT_ROLE: McpKeyRole = 'sales'
export const MCP_RATE_LIMIT_PER_MINUTE = 60

/** Key format: hmk_ + 43 base64url characters (32 random bytes). */
export const MCP_KEY_PREFIX = 'hmk_'
export function isMcpKeyShape(key: string): boolean {
  return /^hmk_[A-Za-z0-9_-]{43}$/.test(key)
}

/** The bearer token from an Authorization header, or '' when missing. */
export function bearerToken(header: string | null | undefined): string {
  const m = String(header || '').match(/^Bearer\s+(\S+)\s*$/i)
  return m ? m[1] : ''
}

// ---- Paging -----------------------------------------------------------------

export const PAGE_MAX = 50
export const PAGE_DEFAULT = 20

export function clampPage(limit: unknown, offset: unknown): { limit: number; offset: number } {
  const l = Math.floor(Number(limit))
  const o = Math.floor(Number(offset))
  return {
    limit: Number.isFinite(l) && l >= 1 ? Math.min(PAGE_MAX, l) : PAGE_DEFAULT,
    offset: Number.isFinite(o) && o >= 0 ? Math.min(o, 100_000) : 0,
  }
}

export type Page<T> = { items: T[]; limit: number; offset: number; has_more: boolean; next_offset: number | null }

/** `fetched` holds up to limit + 1 rows starting at offset; the extra row only says there is more. */
export function pageFrom<T>(fetched: T[], limit: number, offset: number): Page<T> {
  const has_more = fetched.length > limit
  return { items: fetched.slice(0, limit), limit, offset, has_more, next_offset: has_more ? offset + limit : null }
}

/** Page an in-memory list (merged or filtered rows). */
export function pageOf<T>(all: T[], limit: number, offset: number): Page<T> {
  return pageFrom(all.slice(offset, offset + limit + 1), limit, offset)
}

/** Text for a PostgREST ilike pattern: % and _ and commas taken out. */
export function likeText(raw: unknown, max = 100): string {
  return String(raw ?? '')
    .replace(/[%_,()*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// ---- Pipelines and stages ---------------------------------------------------

/** The three pipelines a tool can name, and where each lives. */
export const MCP_PIPELINES = {
  company: { table: 'crm', stageColumn: 'pipeline_stage', pipelineKey: 'crm', label: 'Company CRM' },
  ai_crm: { table: 'sales_deals', stageColumn: 'stage', pipelineKey: 'sales', label: 'AI CRM sales' },
  ctrm_next: { table: 'ctrm_deals', stageColumn: 'stage', pipelineKey: 'ctrm', label: 'CTRM Next' },
} as const
export type McpPipeline = keyof typeof MCP_PIPELINES
export const MCP_PIPELINE_NAMES = Object.keys(MCP_PIPELINES) as McpPipeline[]

export type StageDef = { key: string; outcome: 'open' | 'won' | 'lost' }

/** Built-in stage order, used when the pipelines table has no stages for it. */
export function defaultStages(pipeline: McpPipeline): StageDef[] {
  const outcome = (k: string): StageDef['outcome'] =>
    k === 'Won' || k === 'signed' ? 'won' : k === 'Lost' || k === 'lost' ? 'lost' : 'open'
  const keys: string[] =
    pipeline === 'company'
      ? [...PIPELINE_STAGES]
      : pipeline === 'ai_crm'
        ? SALES_STAGES.map((s) => s.value)
        : CTRM_STAGES.map((s) => s.value)
  return keys.map((key) => ({ key, outcome: outcome(key) }))
}

/** Stages from pipeline_stages (in sort order) when there are any, else the built-in list. */
export function stagesFor(
  pipeline: McpPipeline,
  dbStages: { stage_key: string; outcome?: string | null; active?: boolean | null }[] | null | undefined,
): StageDef[] {
  const active = (dbStages || []).filter((s) => s.active !== false && s.stage_key)
  if (!active.length) return defaultStages(pipeline)
  // ai_crm and ctrm_next stages are fixed by the table's CHECK: keep only keys the table accepts.
  const allowed = new Set(defaultStages(pipeline).map((s) => s.key))
  const list = active
    .filter((s) => pipeline === 'company' || allowed.has(s.stage_key))
    .map((s) => ({
      key: s.stage_key,
      outcome: (s.outcome === 'won' || s.outcome === 'lost' ? s.outcome : 'open') as StageDef['outcome'],
    }))
  return list.length ? list : defaultStages(pipeline)
}

const CLOSED_WORDS = new Set(['won', 'lost', 'signed'])

/**
 * Why a stage move is not allowed, or null when it is.
 * Moves go forward only, and never to a won or lost stage (people close deals).
 */
export function stageMoveProblem(stages: StageDef[], from: string, to: string): string | null {
  const target = stages.find((s) => s.key.toLowerCase() === to.toLowerCase())
  if (!target) return `Unknown stage "${to}". Stages: ${stages.filter((s) => s.outcome === 'open').map((s) => s.key).join(', ')}`
  if (target.outcome !== 'open' || CLOSED_WORDS.has(target.key.toLowerCase())) {
    return `Moving a deal to "${target.key}" is not allowed from the AI connector. A person must close deals in HighMast.`
  }
  const fromIdx = stages.findIndex((s) => s.key.toLowerCase() === String(from || '').toLowerCase())
  const fromStage = fromIdx >= 0 ? stages[fromIdx] : null
  if (fromStage && fromStage.outcome !== 'open') return `This deal is already closed (${fromStage.key}).`
  const toIdx = stages.indexOf(target)
  if (fromIdx >= 0 && toIdx <= fromIdx) {
    return `Stages only move forward. The deal is at "${fromStage!.key}"; pick a later stage.`
  }
  return null
}

/** The stage key exactly as stored (case from the stage list). */
export function canonicalStage(stages: StageDef[], to: string): string {
  return stages.find((s) => s.key.toLowerCase() === to.toLowerCase())?.key ?? to
}

// ---- Leads ------------------------------------------------------------------

const COMPANY_SUFFIXES = /\b(l\s*l\s*c|llc|fze|fzco|fz\s*llc|fzc|dmcc|ltd|limited|inc|incorporated|co|company|corp|corporation|plc|gmbh|pvt|private|est|establishment|trading|group)\b/g

/** Company name for matching: lower case, no punctuation, no LLC / FZE / Ltd and so on. */
export function normalizeCompany(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,'"()\-/]/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[^a-z0-9؀-ۿ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sameCompany(a: string, b: string): boolean {
  const x = normalizeCompany(a)
  return x !== '' && x === normalizeCompany(b)
}

/** The first meaningful word of a company name, to narrow the database search. */
export function companySearchWord(name: string): string {
  const words = normalizeCompany(name).split(' ').filter((w) => w.length >= 2)
  return words.sort((a, b) => b.length - a.length)[0] || likeText(name, 40)
}

export const LEAD_ACCOUNT_TYPE: Record<Exclude<McpPipeline, 'company'>, 'ai_crm_client' | 'ctrm_prospect'> = {
  ai_crm: 'ai_crm_client',
  ctrm_next: 'ctrm_prospect',
}

export const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map((t) => t.value)

export function leadNote(input: { source: string; title: string; notes: string; keyName: string }): string {
  return [
    `New lead from ${input.source || 'AI connector'} (added by AI key "${input.keyName}")`,
    input.title ? `Title: ${input.title}` : '',
    input.notes,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000)
}

// ---- Dashboard --------------------------------------------------------------

export type InvoiceLike = { date: string | null; payment_terms?: string | null; status: string; payment_status: string }

/** Days past due for an invoice that has gone out and is not paid, or null when not overdue. */
export function invoiceDaysOverdue(inv: InvoiceLike, today: Date): number | null {
  if (!isCollectible(inv)) return null
  const due = invoiceDueDate({ date: inv.date, payment_terms: inv.payment_terms ?? '' })
  if (!due) return null
  const days = Math.floor((startOfDayUtc(today) - Date.parse(due + 'T00:00:00Z')) / 86_400_000)
  return days > 0 ? days : null
}

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function isoDay(d: Date): string {
  return new Date(startOfDayUtc(d)).toISOString().slice(0, 10)
}

export function addDaysIso(d: Date, days: number): string {
  return new Date(startOfDayUtc(d) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Days without a touch before an open deal counts as stale (the watchdog defaults). */
export const MCP_STALE_DAYS: Record<McpPipeline, number> = {
  company: DEFAULT_STALE_DAYS.crm,
  ai_crm: DEFAULT_STALE_DAYS.sales,
  ctrm_next: DEFAULT_STALE_DAYS.ctrm,
}

export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / 86_400_000)
}

export function isOpenCrmStage(stage: string): boolean {
  return stage !== 'Won' && stage !== 'Lost'
}

export type TicketLike = { status: string; created_at: string; sla_due_at: string | null; first_response_at: string | null }

/** 'breached' or 'warning' for open tickets near or past their first reply target, else null. */
export function ticketReplyAlert(t: TicketLike, now: Date): 'breached' | 'warning' | null {
  if (!isOpenTicket(t as { status: 'new' | 'open' | 'waiting_on_client' | 'resolved' | 'closed' })) return null
  const s = slaState(t, now)
  return s === 'breached' || s === 'warning' ? s : null
}

// ---- Audit ------------------------------------------------------------------

/** Tool arguments for the audit log: long text cut, at most 20 fields. */
/** Argument names whose values never go into the audit log. */
export const SENSITIVE_ARG = /salary|iban|passport|emirates|national_id|labour_card|bank_routing/i

export function auditArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args as Record<string, unknown>).slice(0, 20)) {
    if (SENSITIVE_ARG.test(k) && v != null && v !== '') out[k] = '[hidden]'
    else if (typeof v === 'string') out[k] = v.length > 200 ? v.slice(0, 200) + '…' : v
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v
    else out[k] = '[object]'
  }
  return out
}

// ---- Generated PDFs (get_quote_pdf, get_invoice_pdf, get_delivery_note_pdf) ----

/** Private Storage bucket for the PDFs the app's Download PDF makes. */
export const GENERATED_PDF_BUCKET = 'generated-pdfs'
export type GeneratedPdfKind = 'quote' | 'invoice' | 'delivery-note'
const PDF_FOLDER: Record<GeneratedPdfKind, string> = { quote: 'quotes', invoice: 'invoices', 'delivery-note': 'delivery-notes' }
/** Signed links to a generated PDF last this long (1 hour). */
export const GENERATED_PDF_LINK_SECONDS = 3600

/**
 * Where a document's PDF lives: quotes/RR-01-26007.pdf. Null when the number
 * has characters a file name should not (the database refuses those too).
 */
export function generatedPdfPath(kind: GeneratedPdfKind, number: string | null | undefined): string | null {
  const n = String(number || '').trim()
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(n) || n.startsWith('.')) return null
  return `${PDF_FOLDER[kind]}/${n}.pdf`
}

/** The number a quote's PDF is filed under: its RR reference, or its draft id before that. */
export function quotePdfNumber(q: { reference_number?: string | null; quote_id?: string | null }): string {
  return String(q.reference_number || q.quote_id || '').trim()
}
