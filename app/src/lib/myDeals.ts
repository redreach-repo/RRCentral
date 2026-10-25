import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { normalizeCompanyName } from './accounts'
import { stageLabel as ctrmStageLabel, isOpenDeal as isOpenCtrmDeal } from './ctrm'
import { PIPELINE_WEIGHTS } from './mrr'
import { can } from './permissions'
import { isOpenSalesDeal, quoteFirstYear, salesStageLabel } from './salesPipeline'
import type {
  Account,
  AppUser,
  CrmEntry,
  CtrmCommission,
  CtrmDeal,
  CtrmStage,
  CtrmStageChange,
  Quotation,
  SalesDeal,
  SalesStage,
  UserRole,
} from './types'

/**
 * My deals: the original CRM, AI CRM sales and CTRM Next deals in one list,
 * so each person sees everything they are chasing in one place. Pure code;
 * the loading is in myDealsStore.ts.
 *
 * Values are AED. CRM: its open quotations (AED equivalent), or the awarded
 * ones once Won. AI CRM sales: the first year value of the quote. CTRM Next:
 * Red Reach's expected commission, and only for roles that may see it (admin,
 * manager, sales); for staff and viewers it is left out, not just hidden.
 */

export type DealPipeline = 'crm' | 'sales' | 'ctrm'

/**
 * What each role sees. Staff have no access to the original CRM, so it is not
 * loaded for them; CTRM commission is only for admin, manager and sales.
 */
export function dealAccess(role: UserRole | null | undefined): { pipelines: DealPipeline[]; commission: boolean } {
  return {
    pipelines: can(role, 'legacy.access') ? ['crm', 'sales', 'ctrm'] : ['sales', 'ctrm'],
    commission: can(role, 'ctrm.commission'),
  }
}

export const PIPELINE_LABELS: Record<DealPipeline, string> = {
  crm: 'CRM',
  sales: 'AI CRM sales',
  ctrm: 'CTRM Next',
}

/** Where a deal sits on the shared board, whatever its own pipeline calls the stage. */
export type BoardColumn = 'new' | 'talking' | 'proposal' | 'deciding' | 'won' | 'lost'

export const BOARD_COLUMNS: { value: BoardColumn; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'talking', label: 'Talking' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'deciding', label: 'Deciding' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

/**
 * Share of a deal's value counted as likely, per stage. AI CRM sales uses the
 * weights the MRR forecast already uses (PIPELINE_WEIGHTS); the CRM and CTRM
 * Next stages are set on the same scale.
 */
export const CRM_STAGE_WEIGHTS: Record<string, number> = {
  Lead: 0.1,
  Contacted: 0.25,
  Quoted: 0.5,
  Negotiation: 0.75,
  Won: 1,
  Lost: 0,
}

export const CTRM_STAGE_WEIGHTS: Record<CtrmStage, number> = {
  identified: 0.05,
  contacted: 0.1,
  intro_call_booked: 0.25,
  demo_done: 0.4,
  evaluating: 0.5,
  decision_pending: 0.75,
  signed: 1,
  lost: 0,
}

export function salesStageWeight(stage: SalesStage): number {
  if (stage === 'signed') return 1
  if (stage === 'lost') return 0
  return PIPELINE_WEIGHTS[stage] ?? 0
}

const CRM_COLUMNS: Record<string, BoardColumn> = {
  Lead: 'new',
  Contacted: 'talking',
  Quoted: 'proposal',
  Negotiation: 'deciding',
  Won: 'won',
  Lost: 'lost',
}
const SALES_COLUMNS: Record<SalesStage, BoardColumn> = {
  lead: 'new',
  discovery_call: 'talking',
  quote_sent: 'proposal',
  signed: 'won',
  lost: 'lost',
}
const CTRM_COLUMNS: Record<CtrmStage, BoardColumn> = {
  identified: 'new',
  contacted: 'talking',
  intro_call_booked: 'talking',
  demo_done: 'proposal',
  evaluating: 'proposal',
  decision_pending: 'deciding',
  signed: 'won',
  lost: 'lost',
}

export type DealRow = {
  /** `<pipeline>:<id>`, unique across the three. */
  key: string
  pipeline: DealPipeline
  id: string
  account: string
  account_id: string | null
  /** What is being sold, in a few words. */
  deal: string
  stage: string
  stageLabel: string
  column: BoardColumn
  open: boolean
  /** AED. Null when there is nothing to value yet, or the role may not see it (CTRM commission). */
  value: number | null
  weighted: number | null
  next_action: string
  next_action_date: string | null
  overdue: boolean
  /** Whole days since the deal reached its stage. */
  days_in_stage: number
  owner_user_id: string | null
  /** The owner's name, or the CRM owner text when no team login matches it. */
  owner_label: string
  source: string
  /** Division code (01 to 06), or '' when it has none. */
  division: string
  link: string
}

export type MyDealsInput = {
  now: Date
  users: Pick<AppUser, 'id' | 'email' | 'name'>[]
  accounts: Pick<Account, 'id' | 'name' | 'source'>[]
  crm: (Pick<
    CrmEntry,
    'id' | 'company_name' | 'owner' | 'pipeline_stage' | 'next_action' | 'follow_up_date' | 'quote_ref' | 'updated_at' | 'created_at'
  > & { stage_changed_at?: string | null })[]
  salesDeals: (Pick<
    SalesDeal,
    | 'id'
    | 'account_id'
    | 'stage'
    | 'source'
    | 'owner_user_id'
    | 'next_action'
    | 'next_action_date'
    | 'monthly_fee'
    | 'setup_fee'
    | 'discount_percent'
    | 'discount_months'
    | 'quote_sent_at'
    | 'signed_at'
    | 'created_at'
  > & { stage_changed_at?: string | null })[]
  ctrmDeals: (Pick<
    CtrmDeal,
    'id' | 'account_id' | 'stage' | 'source' | 'owner_user_id' | 'next_action' | 'next_action_date' | 'company_type' | 'created_at'
  > & { stage_changed_at?: string | null })[]
  ctrmStageChanges: Pick<CtrmStageChange, 'deal_id' | 'to_stage' | 'changed_at'>[]
  /** Empty for roles that may not see commission (RLS returns none anyway). */
  commissions: Pick<CtrmCommission, 'deal_id' | 'expected_commission'>[]
  quotations: Pick<Quotation, 'client' | 'reference_number' | 'status' | 'amount' | 'base_amount' | 'division_code'>[]
  /** Division the AI CRM work is filed under (Packages and rates); usually 03. */
  salesDivision: string
  /** False for staff and viewers: CTRM commission is never put on a row. */
  canSeeCommission: boolean
}

const OPEN_QUOTE = new Set(['Draft', 'Finalized', 'Sent'])
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const today = (now: Date) => format(now, 'yyyy-MM-dd')

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0
  return Math.max(0, differenceInCalendarDays(now, parseISO(String(iso))))
}

function quoteAed(q: Pick<Quotation, 'amount' | 'base_amount'>): number {
  const base = Number(q.base_amount)
  return base > 0 ? base : Number(q.amount) || 0
}

export function buildDealRows(input: MyDealsInput): DealRow[] {
  const { now } = input
  const userName = new Map(input.users.map((u) => [u.id, u.name || u.email]))
  const userByName = new Map(
    input.users.filter((u) => u.name).map((u) => [u.name.trim().toLowerCase(), u]),
  )
  const account = new Map(input.accounts.map((a) => [a.id, a]))
  const owner = (id: string | null) => ({
    owner_user_id: id && userName.has(id) ? id : null,
    owner_label: (id && userName.get(id)) || '',
  })
  const isOverdue = (open: boolean, date: string | null) => open && Boolean(date) && String(date) < today(now)

  // Quotations per company, for CRM values and divisions.
  const quotesByCompany = new Map<string, typeof input.quotations>()
  for (const q of input.quotations) {
    const key = normalizeCompanyName(q.client)
    if (!key) continue
    quotesByCompany.set(key, [...(quotesByCompany.get(key) || []), q])
  }

  const rows: DealRow[] = []

  for (const c of input.crm) {
    const stage = c.pipeline_stage || 'Lead'
    const open = stage !== 'Won' && stage !== 'Lost'
    const quotes = quotesByCompany.get(normalizeCompanyName(c.company_name)) || []
    const counted = quotes.filter((q) => (stage === 'Won' ? q.status === 'Awarded' : OPEN_QUOTE.has(q.status)))
    const byRef = c.quote_ref ? quotes.find((q) => q.reference_number === c.quote_ref.trim()) : undefined
    const value = counted.length ? round2(counted.reduce((s, q) => s + quoteAed(q), 0)) : byRef ? round2(quoteAed(byRef)) : null
    const login = userByName.get(String(c.owner || '').trim().toLowerCase())
    const division = (byRef || counted[0] || quotes[0])?.division_code || ''
    const weight = CRM_STAGE_WEIGHTS[stage] ?? 0
    rows.push({
      key: `crm:${c.id}`,
      pipeline: 'crm',
      id: c.id,
      account: c.company_name || 'CRM lead',
      account_id: null,
      deal: counted.length ? counted.map((q) => q.reference_number).join(', ') : c.quote_ref || 'CRM lead',
      stage,
      stageLabel: stage,
      column: CRM_COLUMNS[stage] ?? 'new',
      open,
      value,
      weighted: value === null ? null : round2(value * weight),
      next_action: c.next_action || '',
      next_action_date: c.follow_up_date,
      overdue: isOverdue(open, c.follow_up_date),
      days_in_stage: daysSince(c.stage_changed_at || c.updated_at || c.created_at, now),
      owner_user_id: login?.id ?? null,
      owner_label: login ? login.name : String(c.owner || ''),
      source: '',
      division,
      link: `/crm?edit=${c.id}`,
    })
  }

  for (const d of input.salesDeals) {
    const open = isOpenSalesDeal(d)
    const quoted = Number(d.monthly_fee) > 0 || Number(d.setup_fee) > 0
    const value = quoted ? quoteFirstYear(d) : null
    const since =
      d.stage_changed_at ||
      (d.stage === 'signed' ? d.signed_at : d.stage === 'quote_sent' ? d.quote_sent_at : null) ||
      d.created_at
    rows.push({
      key: `sales:${d.id}`,
      pipeline: 'sales',
      id: d.id,
      account: account.get(d.account_id)?.name || 'AI CRM prospect',
      account_id: d.account_id,
      deal: 'AI CRM',
      stage: d.stage,
      stageLabel: salesStageLabel(d.stage),
      column: SALES_COLUMNS[d.stage] ?? 'new',
      open,
      value,
      weighted: value === null ? null : round2(value * salesStageWeight(d.stage)),
      next_action: d.next_action || '',
      next_action_date: d.next_action_date,
      overdue: isOverdue(open, d.next_action_date),
      days_in_stage: daysSince(since, now),
      ...owner(d.owner_user_id),
      source: d.source || account.get(d.account_id)?.source || '',
      division: input.salesDivision,
      link: `/accounts/${d.account_id}`,
    })
  }

  // Latest move into the current stage, for deals saved before stage_changed_at existed.
  const movedAt = new Map<string, string>()
  for (const ch of input.ctrmStageChanges) {
    const k = `${ch.deal_id}:${ch.to_stage}`
    const seen = movedAt.get(k)
    if (!seen || ch.changed_at > seen) movedAt.set(k, ch.changed_at)
  }
  const commission = new Map(
    input.canSeeCommission ? input.commissions.map((c) => [c.deal_id, Number(c.expected_commission) || 0]) : [],
  )
  for (const d of input.ctrmDeals) {
    const open = isOpenCtrmDeal(d)
    const value = commission.has(d.id) && commission.get(d.id)! > 0 ? round2(commission.get(d.id)!) : null
    rows.push({
      key: `ctrm:${d.id}`,
      pipeline: 'ctrm',
      id: d.id,
      account: account.get(d.account_id)?.name || 'CTRM prospect',
      account_id: d.account_id,
      deal: 'CTRM Next introduction',
      stage: d.stage,
      stageLabel: ctrmStageLabel(d.stage),
      column: CTRM_COLUMNS[d.stage] ?? 'new',
      open,
      value,
      weighted: value === null ? null : round2(value * (CTRM_STAGE_WEIGHTS[d.stage] ?? 0)),
      next_action: d.next_action || '',
      next_action_date: d.next_action_date,
      overdue: isOverdue(open, d.next_action_date),
      days_in_stage: daysSince(d.stage_changed_at || movedAt.get(`${d.id}:${d.stage}`) || d.created_at, now),
      ...owner(d.owner_user_id),
      source: d.source || account.get(d.account_id)?.source || '',
      division: '',
      link: `/accounts/${d.account_id}`,
    })
  }

  return rows
}

export type DealFilters = {
  /** A user id, 'all', or 'none' for deals nobody owns. */
  owner: string
  pipeline: DealPipeline | 'all'
  source: string
  /** A division code, 'all', or 'none'. */
  division: string
  /** Show won and lost deals too. */
  showClosed: boolean
}

export function filterDeals(rows: DealRow[], f: DealFilters): DealRow[] {
  return rows.filter((r) => {
    if (!f.showClosed && !r.open) return false
    if (f.pipeline !== 'all' && r.pipeline !== f.pipeline) return false
    if (f.owner === 'none' ? r.owner_user_id !== null : f.owner !== 'all' && r.owner_user_id !== f.owner) return false
    if (f.source !== 'all' && (r.source || '') !== f.source) return false
    if (f.division === 'none' ? r.division !== '' : f.division !== 'all' && r.division !== f.division) return false
    return true
  })
}

/** Overdue first, then by next action date (no date last), then by name. */
export function sortDeals(rows: DealRow[]): DealRow[] {
  return [...rows].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    const ad = a.next_action_date || '9999-12-31'
    const bd = b.next_action_date || '9999-12-31'
    if (ad !== bd) return ad.localeCompare(bd)
    return a.account.localeCompare(b.account)
  })
}

export type DealTotals = { count: number; value: number; weighted: number }

export function dealTotals(rows: DealRow[]): DealTotals {
  return {
    count: rows.length,
    value: round2(rows.reduce((s, r) => s + (r.value ?? 0), 0)),
    weighted: round2(rows.reduce((s, r) => s + (r.weighted ?? 0), 0)),
  }
}

/** The distinct sources on the rows, for the filter. */
export function dealSources(rows: DealRow[]): string[] {
  return [...new Set(rows.map((r) => r.source).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}
