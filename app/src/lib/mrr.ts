/**
 * Monthly recurring revenue (Tier 4): this month's MRR, what was new and
 * lost each month, and a three month forecast. AED, excluding VAT, from the
 * contracts' monthly fees (setup fees are one off, so they are not MRR).
 * Only pure code here.
 */
import { addMonths, endOfMonth, format, parseISO } from 'date-fns'
import { effectiveMonthlyFee, monthKey } from './delivery'
import { isOpenSalesDeal } from './salesPipeline'
import type { Contract, SalesDeal, SalesStage } from './types'

type MrrContract = Pick<
  Contract,
  | 'id'
  | 'account_id'
  | 'status'
  | 'monthly_fee'
  | 'discount_percent'
  | 'discount_months_left'
  | 'term_start'
  | 'term_end'
  | 'billing_from'
  | 'created_at'
  | 'updated_at'
>

/** Share of an open deal's quoted monthly fee the forecast counts on. */
export const PIPELINE_WEIGHTS: Partial<Record<SalesStage, number>> = {
  lead: 0.1,
  discovery_call: 0.25,
  quote_sent: 0.5,
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null)

/** The days a contract brings in monthly revenue. End null means it is still running (month to month after the term). */
export function contractInterval(c: MrrContract): { start: string; end: string | null } | null {
  if (c.status === 'draft') return null
  const start = day(c.billing_from) ?? day(c.term_start) ?? day(c.created_at)
  if (!start) return null
  if (c.status === 'active') return { start, end: null }
  // Ended or cancelled: the term end, or the day it was closed if that came first.
  const closed = day(c.updated_at)
  const termEnd = day(c.term_end)
  const end = termEnd && closed ? (termEnd < closed ? termEnd : closed) : (termEnd ?? closed)
  return { start, end }
}

/**
 * The contract's monthly fee in a month, counted when it runs to the end of
 * that month. `monthsAhead` is how far the month is from this month, so
 * discounts drop off as they run out; past months use today's fee.
 */
export function contractMrr(c: MrrContract, month: string, monthsAhead = 0): number {
  const span = contractInterval(c)
  if (!span) return 0
  const last = format(endOfMonth(parseISO(monthKey(month))), 'yyyy-MM-dd')
  if (span.start > last) return 0
  if (span.end && span.end < last) return 0
  const left = Number(c.discount_months_left) || 0
  if (monthsAhead > 0) {
    return effectiveMonthlyFee({ ...c, discount_months_left: Math.max(0, left - monthsAhead) })
  }
  return effectiveMonthlyFee(c)
}

export function mrrByAccount(contracts: MrrContract[], month: string, monthsAhead = 0): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of contracts) {
    const fee = contractMrr(c, month, monthsAhead)
    if (fee > 0) out.set(c.account_id, round2((out.get(c.account_id) ?? 0) + fee))
  }
  return out
}

export type MrrMonth = {
  month: string
  label: string
  mrr: number
  clients: number
  /** MRR from clients who were not paying the month before. */
  added: number
  /** Existing clients paying more (upgrades, discounts ending). */
  expansion: number
  /** Existing clients paying less. */
  contraction: number
  /** MRR from clients who stopped. */
  lost: number
  newClients: string[]
  lostClients: string[]
}

/** MRR and its movements for each month, oldest first. `count` months ending with `today`'s month. */
export function mrrHistory(contracts: MrrContract[], count = 12, today: Date = new Date()): MrrMonth[] {
  const months = Array.from({ length: count }, (_, i) => monthKey(addMonths(today, i - count + 1)))
  let prev = mrrByAccount(contracts, monthKey(addMonths(parseISO(months[0]), -1)))
  return months.map((month) => {
    const now = mrrByAccount(contracts, month)
    const row: MrrMonth = {
      month,
      label: format(parseISO(month), 'MMM yyyy'),
      mrr: round2([...now.values()].reduce((a, b) => a + b, 0)),
      clients: now.size,
      added: 0,
      expansion: 0,
      contraction: 0,
      lost: 0,
      newClients: [],
      lostClients: [],
    }
    for (const [acc, fee] of now) {
      const before = prev.get(acc) ?? 0
      if (!before) {
        row.added += fee
        row.newClients.push(acc)
      } else if (fee > before) row.expansion += fee - before
      else if (fee < before) row.contraction += before - fee
    }
    for (const [acc, fee] of prev) {
      if (!now.has(acc)) {
        row.lost += fee
        row.lostClients.push(acc)
      }
    }
    row.added = round2(row.added)
    row.expansion = round2(row.expansion)
    row.contraction = round2(row.contraction)
    row.lost = round2(row.lost)
    prev = now
    return row
  })
}

export type ForecastMonth = {
  month: string
  label: string
  /** Running and signed contracts, with discounts ending as scheduled. */
  contracted: number
  /** Clients whose term ends this month (they continue month to month unless they give notice). */
  renewalsDue: number
  /** Open quotes and deals, weighted by how likely they are to sign. */
  pipeline: number
  total: number
}

/** Next `count` months. Deals start on their agreed date, or the first of next month. */
export function mrrForecast(
  contracts: (MrrContract & Pick<Contract, 'term_end'>)[],
  deals: Pick<SalesDeal, 'stage' | 'monthly_fee' | 'start_date' | 'contract_id'>[],
  count = 3,
  today: Date = new Date(),
): ForecastMonth[] {
  const nextMonth = monthKey(addMonths(today, 1))
  return Array.from({ length: count }, (_, i) => {
    const ahead = i + 1
    const month = monthKey(addMonths(today, ahead))
    const contracted = round2([...mrrByAccount(contracts, month, ahead).values()].reduce((a, b) => a + b, 0))
    const renewalsDue = contracts.filter((c) => c.status === 'active' && c.term_end && monthKey(c.term_end) === month).length
    let pipeline = 0
    for (const d of deals) {
      if (!isOpenSalesDeal(d) || d.contract_id) continue
      const start = d.start_date ? monthKey(d.start_date) : nextMonth
      if (start > month) continue
      pipeline += (Number(d.monthly_fee) || 0) * (PIPELINE_WEIGHTS[d.stage] ?? 0)
    }
    pipeline = round2(pipeline)
    return { month, label: format(parseISO(month), 'MMM yyyy'), contracted, renewalsDue, pipeline, total: round2(contracted + pipeline) }
  })
}
