import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ACCOUNT_TYPES, normalizeCompanyName } from './accounts'
import { DIVISIONS } from './config'
import { invoiceDueDate, isCollectible } from './contractBilling'
import { divisionFromReference } from './divisionPipeline'
import { can } from './permissions'
import { expenseVatParts, incomeVatParts, quarterMonths, type VatQuarter } from './finance'
import { RECURRING_DEDUCTIONS } from './recurringDeductions'
import type {
  Account,
  CrmEntry,
  CtrmDeal,
  CtrmStageChange,
  Expense,
  IncomeEntry,
  Invoice,
  PaymentLogEntry,
  Quotation,
  SalesDeal,
  UserRole,
} from './types'

/** Profit (P&L, gross profit, net) is for managers and admins only. */
export function canSeeProfit(role: UserRole | null | undefined): boolean {
  return can(role, 'finance.profit')
}

export const NOT_RECORDED = 'Not recorded'

export type WinRateRow = {
  key: string
  label: string
  open: number
  won: number
  lost: number
  /** won ÷ (won + lost), one decimal. Null until something is decided. */
  winPct: number | null
}

function pct(won: number, lost: number): number | null {
  const decided = won + lost
  return decided > 0 ? Math.round((won / decided) * 1000) / 10 : null
}

function row(key: string, label: string, open: number, won: number, lost: number): WinRateRow {
  return { key, label, open, won, lost, winPct: pct(won, lost) }
}

const QUOTE_LOST = new Set(['Not awarded', 'Expired'])
const QUOTE_WON = new Set(['Awarded', 'Accepted'])

type Pipelines = {
  quotes: Pick<Quotation, 'status'>[]
  crm: Pick<CrmEntry, 'pipeline_stage'>[]
  sales: Pick<SalesDeal, 'stage'>[]
  ctrm: Pick<CtrmDeal, 'stage'>[]
}

/** Win rate for each pipeline: quotations, the CRM, AI CRM sales and CTRM Next. */
export function winRateByPipeline(p: Pipelines): WinRateRow[] {
  const quoteWon = p.quotes.filter((q) => QUOTE_WON.has(q.status)).length
  const quoteLost = p.quotes.filter((q) => QUOTE_LOST.has(q.status)).length
  const quoteOpen = p.quotes.filter((q) => q.status !== 'Cancelled').length - quoteWon - quoteLost
  const crmWon = p.crm.filter((c) => c.pipeline_stage === 'Won').length
  const crmLost = p.crm.filter((c) => c.pipeline_stage === 'Lost').length
  const salesWon = p.sales.filter((d) => d.stage === 'signed').length
  const salesLost = p.sales.filter((d) => d.stage === 'lost').length
  const ctrmWon = p.ctrm.filter((d) => d.stage === 'signed').length
  const ctrmLost = p.ctrm.filter((d) => d.stage === 'lost').length
  return [
    row('quotes', 'Quotations', quoteOpen, quoteWon, quoteLost),
    row('crm', 'CRM', p.crm.length - crmWon - crmLost, crmWon, crmLost),
    row('sales', 'AI CRM sales', p.sales.length - salesWon - salesLost, salesWon, salesLost),
    row('ctrm', 'CTRM Next', p.ctrm.length - ctrmWon - ctrmLost, ctrmWon, ctrmLost),
  ]
}

/** A tidy label for a free-text source; blank means not recorded. */
export function sourceLabel(raw: string | null | undefined): string {
  const s = String(raw || '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!s) return NOT_RECORDED
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** The CRM has no source column. Rows made by the website form came from the website. */
export function crmSource(entry: Pick<CrmEntry, 'created_by'>): string {
  const by = String(entry.created_by || '').trim().toLowerCase()
  return by === 'website' || by === 'lead-intake' ? 'Website' : NOT_RECORDED
}

type Outcome = { source: string; outcome: 'won' | 'lost' | 'open' }

function bySource(rows: Outcome[]): WinRateRow[] {
  const map = new Map<string, { open: number; won: number; lost: number }>()
  for (const r of rows) {
    const cur = map.get(r.source) ?? { open: 0, won: 0, lost: 0 }
    cur[r.outcome] += 1
    map.set(r.source, cur)
  }
  return [...map.entries()]
    .map(([label, c]) => row(label.toLowerCase(), label, c.open, c.won, c.lost))
    .sort((a, b) => {
      if (a.label === NOT_RECORDED) return 1
      if (b.label === NOT_RECORDED) return -1
      return b.won + b.lost + b.open - (a.won + a.lost + a.open) || a.label.localeCompare(b.label)
    })
}

/** Win rate by lead source, across the CRM, AI CRM sales and CTRM Next. */
export function winRateBySource(p: {
  crm: Pick<CrmEntry, 'pipeline_stage' | 'created_by'>[]
  sales: Pick<SalesDeal, 'stage' | 'source'>[]
  ctrm: Pick<CtrmDeal, 'stage' | 'source'>[]
}): WinRateRow[] {
  const rows: Outcome[] = []
  for (const c of p.crm) {
    const outcome = c.pipeline_stage === 'Won' ? 'won' : c.pipeline_stage === 'Lost' ? 'lost' : 'open'
    rows.push({ source: crmSource(c), outcome })
  }
  for (const d of [...p.sales, ...p.ctrm]) {
    const outcome = d.stage === 'signed' ? 'won' : d.stage === 'lost' ? 'lost' : 'open'
    rows.push({ source: sourceLabel(d.source), outcome })
  }
  return bySource(rows)
}

export type CycleRow = {
  key: string
  label: string
  /** Deals won that have both dates. */
  count: number
  avgDays: number | null
  medianDays: number | null
}

function days(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null
  const n = differenceInCalendarDays(parseISO(to.slice(0, 10)), parseISO(from.slice(0, 10)))
  return n >= 0 ? n : null
}

function cycle(key: string, label: string, list: (number | null)[]): CycleRow {
  const xs = list.filter((n): n is number => n != null).sort((a, b) => a - b)
  if (!xs.length) return { key, label, count: 0, avgDays: null, medianDays: null }
  const avg = Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 10) / 10
  const mid = Math.floor(xs.length / 2)
  const median = xs.length % 2 ? xs[mid] : Math.round(((xs[mid - 1] + xs[mid]) / 2) * 10) / 10
  return { key, label, count: xs.length, avgDays: avg, medianDays: median }
}

/**
 * Days from a deal being created to it being won. AI CRM uses signed_at, CTRM Next
 * the first move to signed, and the CRM the last update of a Won row (it keeps no
 * stage history, so that one is an estimate).
 */
export function averageSalesCycle(p: {
  crm: Pick<CrmEntry, 'pipeline_stage' | 'created_at' | 'updated_at'>[]
  sales: Pick<SalesDeal, 'stage' | 'created_at' | 'signed_at'>[]
  ctrm: Pick<CtrmDeal, 'id' | 'stage' | 'created_at'>[]
  ctrmChanges: Pick<CtrmStageChange, 'deal_id' | 'to_stage' | 'changed_at'>[]
}): CycleRow[] {
  const signedAt = new Map<string, string>()
  for (const ch of p.ctrmChanges) {
    if (ch.to_stage !== 'signed') continue
    const prev = signedAt.get(ch.deal_id)
    if (!prev || ch.changed_at < prev) signedAt.set(ch.deal_id, ch.changed_at)
  }
  return [
    cycle('sales', 'AI CRM sales', p.sales.filter((d) => d.stage === 'signed').map((d) => days(d.created_at, d.signed_at))),
    cycle('ctrm', 'CTRM Next', p.ctrm.filter((d) => d.stage === 'signed').map((d) => days(d.created_at, signedAt.get(d.id)))),
    cycle('crm', 'CRM (estimate)', p.crm.filter((c) => c.pipeline_stage === 'Won').map((c) => days(c.created_at, c.updated_at))),
  ]
}

export type RevenueRow = { key: string; label: string; count: number; revenue: number }

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function divisionLabel(code: string | null): string {
  if (!code) return 'Other'
  const d = DIVISIONS.find((x) => x.code === code)
  if (d) return `${d.code} ${d.brand}`
  const t = ACCOUNT_TYPES.find((x) => x.code === code)
  return t ? `${t.code} ${t.plural}` : `${code} Other`
}

function sumBy(rows: { key: string; label: string; amount: number }[]): RevenueRow[] {
  const map = new Map<string, RevenueRow>()
  for (const r of rows) {
    const cur = map.get(r.key) ?? { key: r.key, label: r.label, count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue = round2(cur.revenue + r.amount)
    map.set(r.key, cur)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label))
}

/** Paid revenue (excluding VAT) by the division in the RR-XX reference. Pass recognised income only. */
export function revenueByDivision(income: IncomeEntry[], vatRate = 0.05): RevenueRow[] {
  return sumBy(
    income.map((r) => {
      const code = divisionFromReference(r.reference_number)
      return { key: code ?? 'other', label: divisionLabel(code), amount: incomeVatParts(r, vatRate).exclusive }
    }),
  )
}

/**
 * Paid revenue (excluding VAT) by where the client came from: the invoice's
 * account source, else an account or CRM row with the same company name.
 */
export function revenueByLeadSource(
  income: IncomeEntry[],
  ctx: {
    invoices: Pick<Invoice, 'reference_number' | 'account_id'>[]
    accounts: Pick<Account, 'id' | 'name' | 'source'>[]
    crm: Pick<CrmEntry, 'company_name' | 'created_by'>[]
  },
  vatRate = 0.05,
): RevenueRow[] {
  const accountById = new Map(ctx.accounts.map((a) => [a.id, a]))
  const accountByName = new Map(ctx.accounts.map((a) => [normalizeCompanyName(a.name), a]))
  const crmByName = new Map(ctx.crm.map((c) => [normalizeCompanyName(c.company_name), c]))
  const invoiceAccount = new Map<string, string>()
  for (const inv of ctx.invoices) {
    if (inv.account_id && inv.reference_number) invoiceAccount.set(inv.reference_number.trim(), inv.account_id)
  }
  return sumBy(
    income.map((r) => {
      const name = normalizeCompanyName(r.client_source || '')
      const accountId = invoiceAccount.get(String(r.reference_number || '').trim())
      const account = (accountId && accountById.get(accountId)) || (name ? accountByName.get(name) : undefined)
      let label = account ? sourceLabel(account.source) : NOT_RECORDED
      if (label === NOT_RECORDED && name) {
        const c = crmByName.get(name)
        if (c) label = crmSource(c)
      }
      return { key: label.toLowerCase(), label, amount: incomeVatParts(r, vatRate).exclusive }
    }),
  )
}

export type CashLine = {
  date: string
  kind: 'in' | 'out' | 'vat'
  label: string
  amount: number
  /** True when the money was due before today. */
  overdue?: boolean
}

export type CashWeek = { start: string; end: string; cashIn: number; cashOut: number; net: number; running: number }

export type CashForecast = {
  from: string
  to: string
  lines: CashLine[]
  weeks: CashWeek[]
  totals: { cashIn: number; cashOut: number; vat: number; net: number }
}

/** UAE VAT is filed and paid by the 28th of the month after the quarter ends. */
export function vatDueDate(year: number, quarter: VatQuarter): string {
  const endMonth = quarter * 3
  const y = endMonth === 12 ? year + 1 : year
  const m = endMonth === 12 ? 1 : endMonth + 1
  return `${y}-${String(m).padStart(2, '0')}-28`
}

/** Output VAT minus input VAT for a quarter, from the books. */
export function quarterNetVat(
  year: number,
  quarter: VatQuarter,
  income: IncomeEntry[],
  expenses: Expense[],
  vatRate = 0.05,
): number {
  const months = new Set(quarterMonths(year, quarter))
  const inMonth = (d: string | null) => Boolean(d) && months.has(String(d).slice(0, 7))
  const out = income.filter((r) => inMonth(r.date)).reduce((s, r) => s + incomeVatParts(r, vatRate).vat, 0)
  const inp = expenses.filter((r) => inMonth(r.date)).reduce((s, r) => s + expenseVatParts(r, vatRate).vat, 0)
  return round2(out - inp)
}

/** Invoice total less what the payment log says has come in. */
export function invoiceBalance(inv: Pick<Invoice, 'reference_number' | 'amount'>, paid: Map<string, number>): number {
  const total = Number(inv.amount) || 0
  return round2(Math.max(0, total - (paid.get(String(inv.reference_number || '').trim()) ?? 0)))
}

/**
 * The next 90 days of cash: open invoice balances on their due date (overdue
 * ones land today), recurring bank deductions and the fixed monthly cost going
 * out, and any VAT return that falls due in the window.
 */
export function cashForecast(input: {
  today?: Date
  days?: number
  invoices: Invoice[]
  paymentLog: Pick<PaymentLogEntry, 'invoice_ref' | 'amount'>[]
  income: IncomeEntry[]
  expenses: Expense[]
  fixedMonthlyCostAed?: number
  vatRate?: number
}): CashForecast {
  const today = input.today ?? new Date()
  const span = input.days ?? 90
  const from = format(today, 'yyyy-MM-dd')
  const to = format(addDays(today, span), 'yyyy-MM-dd')
  const lines: CashLine[] = []

  const paid = new Map<string, number>()
  for (const p of input.paymentLog) {
    const ref = String(p.invoice_ref || '').trim()
    if (ref) paid.set(ref, (paid.get(ref) ?? 0) + (Number(p.amount) || 0))
  }
  for (const inv of input.invoices) {
    if (!isCollectible(inv)) continue
    const balance = invoiceBalance(inv, paid)
    if (balance <= 0) continue
    const due = invoiceDueDate(inv) ?? from
    if (due > to) continue
    const overdue = due < from
    lines.push({
      date: overdue ? from : due,
      kind: 'in',
      label: `${inv.reference_number || 'Invoice'} ${inv.client || ''}`.trim(),
      amount: balance,
      overdue,
    })
  }

  // Each calendar month the window touches.
  const months: { y: number; m: number }[] = []
  for (let d = new Date(today.getFullYear(), today.getMonth(), 1); format(d, 'yyyy-MM-dd') <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ y: d.getFullYear(), m: d.getMonth() + 1 })
  }
  const ymd = (y: number, m: number, day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const fixed = Number(input.fixedMonthlyCostAed) || 0
  for (const { y, m } of months) {
    for (const r of RECURRING_DEDUCTIONS) {
      const date = ymd(y, m, r.day)
      if (date >= from && date <= to) lines.push({ date, kind: 'out', label: r.vendor, amount: r.amount })
    }
    const first = ymd(y, m, 1)
    if (fixed > 0 && first >= from && first <= to) lines.push({ date: first, kind: 'out', label: 'Fixed monthly cost', amount: fixed })
  }

  // VAT returns due in the window: last quarter, and this one if it closes in time.
  const quarters = new Set<string>()
  for (let d = addDays(today, -120); format(d, 'yyyy-MM-dd') <= to; d = addDays(d, 28)) {
    quarters.add(`${d.getFullYear()}-${Math.ceil((d.getMonth() + 1) / 3)}`)
  }
  for (const key of quarters) {
    const [y, q] = key.split('-').map(Number) as [number, VatQuarter]
    const due = vatDueDate(y, q)
    if (due < from || due > to) continue
    const net = quarterNetVat(y, q, input.income, input.expenses, input.vatRate)
    if (net > 0) lines.push({ date: due, kind: 'vat', label: `VAT return Q${q} ${y}`, amount: net })
  }

  lines.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))

  const weeks: CashWeek[] = []
  let running = 0
  for (let start = today; format(start, 'yyyy-MM-dd') <= to; start = addDays(start, 7)) {
    const s = format(start, 'yyyy-MM-dd')
    const endDate = addDays(start, 6)
    const e = format(endDate, 'yyyy-MM-dd') > to ? to : format(endDate, 'yyyy-MM-dd')
    const inWeek = lines.filter((l) => l.date >= s && l.date <= e)
    const cashIn = round2(inWeek.filter((l) => l.kind === 'in').reduce((t, l) => t + l.amount, 0))
    const cashOut = round2(inWeek.filter((l) => l.kind !== 'in').reduce((t, l) => t + l.amount, 0))
    running = round2(running + cashIn - cashOut)
    weeks.push({ start: s, end: e, cashIn, cashOut, net: round2(cashIn - cashOut), running })
  }

  const cashIn = round2(lines.filter((l) => l.kind === 'in').reduce((t, l) => t + l.amount, 0))
  const out = round2(lines.filter((l) => l.kind === 'out').reduce((t, l) => t + l.amount, 0))
  const vat = round2(lines.filter((l) => l.kind === 'vat').reduce((t, l) => t + l.amount, 0))
  return { from, to, lines, weeks, totals: { cashIn, cashOut: out, vat, net: round2(cashIn - out - vat) } }
}
