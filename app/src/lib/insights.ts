import { format, parseISO, subMonths } from 'date-fns'
import { assistCostInMonth, type AiUsageRow } from './aiAssist'
import { calculateOverage, currentContract, monthKey, profitability, TIME_CATEGORIES, type DeliveryRates } from './delivery'
import type { Account, Contract, DeliveryPackage, TimeCategory, TimeEntry, UsageRecord } from './types'

/**
 * Tier 4 numbers: how much of Alfred's delivery time is used (utilisation),
 * and how each client's profit moves month to month.
 */

/** Hours a month the team can deliver. About 100 to start; changeable on Packages and rates. */
export const DEFAULT_CAPACITY_HOURS = 100
export const CAPACITY_SETTING_KEY = 'deliveryMonthlyCapacityHours'
/** Average use over the last three full months that means it is time to hire. */
export const HIRE_PERCENT = 85
/** Average use that means watch it. */
export const WATCH_PERCENT = 70

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export function capacityFromSettings(settings: Record<string, string | undefined>): number {
  const n = Number(settings[CAPACITY_SETTING_KEY])
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAPACITY_HOURS
}

/** Month keys (YYYY-MM-01), oldest first, ending with the month of `today`. */
export function lastMonths(count: number, today: Date): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(subMonths(today, count - 1 - i)))
}

export function shortMonth(key: string): string {
  return format(parseISO(key), 'MMM yy')
}

export type UtilisationMonth = {
  month: string
  hours: number
  percent: number
  byCategory: Record<TimeCategory, number>
}

export type Utilisation = {
  capacity: number
  months: UtilisationMonth[]
  /** Average use of the last three full months (this month left out). */
  recentPercent: number
  signal: 'hire' | 'watch' | 'ok'
  /** This month, per person, most hours first. */
  people: { email: string; hours: number }[]
  /** This month, per client, most hours first. */
  clients: { accountId: string; hours: number }[]
}

export function utilisation(input: {
  entries: Pick<TimeEntry, 'account_id' | 'date' | 'hours' | 'category' | 'user_email'>[]
  capacity: number
  today: Date
  months?: number
}): Utilisation {
  const keys = lastMonths(input.months ?? 6, input.today)
  const capacity = input.capacity > 0 ? input.capacity : DEFAULT_CAPACITY_HOURS
  const months = keys.map((month) => {
    const inMonth = input.entries.filter((e) => monthKey(e.date) === month)
    const byCategory = Object.fromEntries(TIME_CATEGORIES.map((c) => [c.value, 0])) as Record<TimeCategory, number>
    let hours = 0
    for (const e of inMonth) {
      hours += num(e.hours)
      byCategory[e.category] = round2((byCategory[e.category] ?? 0) + num(e.hours))
    }
    return { month, hours: round2(hours), percent: round1((hours / capacity) * 100), byCategory }
  })
  const full = months.slice(0, -1).slice(-3)
  const recentPercent = full.length ? round1(full.reduce((s, m) => s + m.percent, 0) / full.length) : 0
  const signal = recentPercent >= HIRE_PERCENT ? 'hire' : recentPercent >= WATCH_PERCENT ? 'watch' : 'ok'

  const thisMonth = keys[keys.length - 1]
  const people = new Map<string, number>()
  const clients = new Map<string, number>()
  for (const e of input.entries) {
    if (monthKey(e.date) !== thisMonth) continue
    const who = e.user_email || 'Unknown'
    people.set(who, (people.get(who) || 0) + num(e.hours))
    clients.set(e.account_id, (clients.get(e.account_id) || 0) + num(e.hours))
  }
  return {
    capacity,
    months,
    recentPercent,
    signal,
    people: [...people].map(([email, hours]) => ({ email, hours: round2(hours) })).sort((a, b) => b.hours - a.hours),
    clients: [...clients].map(([accountId, hours]) => ({ accountId, hours: round2(hours) })).sort((a, b) => b.hours - a.hours),
  }
}

export function signalMessage(u: Utilisation): string {
  if (u.signal === 'hire') return `About ${u.recentPercent}% of your hours used over the last three months. Time to hire or move work to the VA.`
  if (u.signal === 'watch') return `About ${u.recentPercent}% used over the last three months. Plan help before it reaches ${HIRE_PERCENT}%.`
  return `About ${u.recentPercent}% used over the last three months. Room for more clients.`
}

/** Was the contract running in this month? Uses the term dates; drafts never count. */
export function contractRunsIn(c: Pick<Contract, 'status' | 'term_start' | 'term_end'>, month: string): boolean {
  if (c.status === 'draft') return false
  if (!c.term_start) return c.status === 'active'
  if (monthKey(c.term_start) > month) return false
  if (c.term_end && monthKey(c.term_end) < month) return false
  return true
}

export type ProfitMonth = {
  month: string
  running: boolean
  revenueAed: number
  costAed: number
  marginAed: number
  marginPercent: number
  hours: number
}

export type ClientTrend = {
  accountId: string
  name: string
  months: ProfitMonth[]
  /** Margin % of the last full month minus the average of the two before it, in points. */
  changePoints: number | null
  direction: 'up' | 'down' | 'flat' | 'new'
  totalMarginAed: number
}

/**
 * Month by month profit for each AI CRM client. The fee is the one on the
 * contract (with any discount still running), overage comes from that month's
 * usage, cost is tools, AI help and hours at the internal rate.
 */
export function profitTrends(input: {
  accounts: Pick<Account, 'id' | 'name' | 'type'>[]
  contracts: Contract[]
  packages: DeliveryPackage[]
  usage: UsageRecord[]
  entries: Pick<TimeEntry, 'account_id' | 'date' | 'hours'>[]
  assist: AiUsageRow[]
  rates: DeliveryRates
  today: Date
  months?: number
}): ClientTrend[] {
  const keys = lastMonths(input.months ?? 6, input.today)
  const out: ClientTrend[] = []
  for (const a of input.accounts) {
    if (a.type !== 'ai_crm_client') continue
    const contracts = input.contracts.filter((c) => c.account_id === a.id)
    if (!contracts.length) continue
    const months: ProfitMonth[] = keys.map((month) => {
      const running = contracts.filter((c) => contractRunsIn(c, month))
      const contract = currentContract(running)
      const hours = round2(
        input.entries.filter((e) => e.account_id === a.id && monthKey(e.date) === month).reduce((s, e) => s + num(e.hours), 0),
      )
      if (!contract) {
        const labour = round2(hours * input.rates.internalHourlyRateAed)
        return { month, running: false, revenueAed: 0, costAed: labour, marginAed: -labour, marginPercent: 0, hours }
      }
      const pkg = input.packages.find((p) => p.id === contract.package_id) ?? null
      const usage = input.usage.find((u) => u.account_id === a.id && monthKey(u.month) === month) ?? null
      const p = profitability({
        contract,
        pkg,
        usage,
        overageAed: pkg && usage ? calculateOverage(usage, pkg, input.rates).totalAed : 0,
        hours,
        rates: input.rates,
        assistUsd: assistCostInMonth(input.assist, a.id, month),
      })
      return {
        month,
        running: true,
        revenueAed: p.revenueAed,
        costAed: round2(p.toolCostAed + p.labourAed),
        marginAed: p.marginAed,
        marginPercent: p.marginPercent,
        hours,
      }
    })
    const full = months.slice(0, -1)
    const last = full[full.length - 1]
    const before = full.slice(-3, -1).filter((m) => m.running)
    let changePoints: number | null = null
    let direction: ClientTrend['direction'] = 'new'
    if (last?.running && before.length) {
      changePoints = round1(last.marginPercent - before.reduce((s, m) => s + m.marginPercent, 0) / before.length)
      direction = changePoints >= 5 ? 'up' : changePoints <= -5 ? 'down' : 'flat'
    }
    out.push({
      accountId: a.id,
      name: a.name,
      months,
      changePoints,
      direction,
      totalMarginAed: round2(months.reduce((s, m) => s + m.marginAed, 0)),
    })
  }
  // Falling margins first, then the least profitable.
  const order = { down: 0, flat: 1, new: 2, up: 3 }
  return out.sort((x, y) => order[x.direction] - order[y.direction] || x.totalMarginAed - y.totalMarginAed)
}
