/**
 * Client health score (Tier 4): 0 to 100 from four parts worth 25 each:
 * usage against the plan, support ticket volume, monthly report calls
 * attended, and how late invoices are. Below 50, or any red flag, shows a
 * churn warning. Only pure code here.
 */
import { addMonths, differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'
import { invoiceDueDate, isCollectible } from './contractBilling'
import { monthKey, renewalFlag } from './delivery'
import { isOpenTicket } from './support'
import { colors } from './uiStyles'
import type { Contract, DeliveryPackage, Invoice, ReportCall, Ticket, UsageRecord } from './types'

export type HealthBand = 'healthy' | 'watch' | 'at_risk'

export type HealthPart = {
  key: 'usage' | 'tickets' | 'calls' | 'payments'
  label: string
  points: number
  /** Plain words on why it scored this. */
  note: string
}

export type ClientHealth = {
  score: number
  band: HealthBand
  parts: HealthPart[]
  /** Reasons the client may leave. Any flag shows the churn warning. */
  flags: string[]
  churnWarning: boolean
}

export const HEALTH_BAND_LABELS: Record<HealthBand, string> = {
  healthy: 'Healthy',
  watch: 'Keep an eye on',
  at_risk: 'At risk',
}

export const HEALTH_BAND_COLORS: Record<HealthBand, string> = {
  healthy: colors.success,
  watch: colors.warn,
  at_risk: colors.danger,
}

export const REPORT_CALL_LABELS: Record<ReportCall['status'], string> = {
  attended: 'Attended',
  missed: 'Missed',
  rescheduled: 'Moved',
}

/** Points when there is no data yet for a part: neither good nor bad. */
const NEUTRAL = 15

export type HealthInput = {
  contract: Pick<Contract, 'term_end' | 'status'> | null
  pkg: Pick<DeliveryPackage, 'included_whatsapp'> | null
  usage: Pick<UsageRecord, 'month' | 'whatsapp_marketing_count' | 'whatsapp_service_count'>[]
  tickets: Pick<Ticket, 'status' | 'created_at' | 'sla_due_at' | 'resolved_at'>[]
  calls: Pick<ReportCall, 'month' | 'status'>[]
  /** Invoices with what is still owed on each. */
  invoices: { invoice: Pick<Invoice, 'date' | 'payment_terms' | 'status' | 'payment_status'>; balance: number }[]
  today?: Date
}

const used = (u: HealthInput['usage'][number]) => Number(u.whatsapp_marketing_count || 0) + Number(u.whatsapp_service_count || 0)
const pct = (n: number) => `${Math.round(n * 100)}%`

function usagePart(input: HealthInput, today: Date, flags: string[]): HealthPart {
  const base = { key: 'usage' as const, label: 'Usage' }
  const included = Number(input.pkg?.included_whatsapp || 0)
  // The last two full months.
  const last = monthKey(addMonths(today, -1))
  const before = monthKey(addMonths(today, -2))
  const byMonth = new Map(input.usage.map((u) => [monthKey(u.month), used(u)]))
  if (!included || !byMonth.has(last)) {
    return { ...base, points: NEUTRAL, note: included ? 'No usage recorded for last month yet.' : 'No plan allowance to compare with.' }
  }
  const ratio = (byMonth.get(last) ?? 0) / included
  let points = ratio >= 0.5 ? 25 : ratio >= 0.25 ? 15 : ratio >= 0.1 ? 8 : 0
  let note = `Used ${pct(ratio)} of the WhatsApp allowance last month.`
  const prev = byMonth.get(before)
  if (prev !== undefined && prev > 0 && (byMonth.get(last) ?? 0) < prev / 2) {
    points = Math.max(0, points - 5)
    note += ` Down by more than half on the month before.`
    flags.push('Usage dropped by more than half last month')
  }
  if (ratio < 0.1 && prev !== undefined && prev / included < 0.1) flags.push('Hardly using the system for two months')
  return { ...base, points, note }
}

function ticketsPart(input: HealthInput, today: Date, flags: string[]): HealthPart {
  const since = subDays(today, 30)
  const recent = input.tickets.filter((t) => parseISO(t.created_at) >= since).length
  let points = recent <= 2 ? 25 : recent <= 5 ? 18 : recent <= 9 ? 10 : 3
  const late = input.tickets.filter((t) => isOpenTicket(t) && t.sla_due_at && parseISO(t.sla_due_at) < today).length
  let note = `${recent} ${recent === 1 ? 'ticket' : 'tickets'} in the last 30 days.`
  if (late) {
    points = Math.max(0, points - 5)
    note += ` ${late} open past the promised reply time.`
  }
  if (recent >= 10) flags.push(`${recent} support tickets in 30 days`)
  return { key: 'tickets', label: 'Support', points, note }
}

function callsPart(input: HealthInput, today: Date, flags: string[]): HealthPart {
  // Report calls for the last three months, newest first.
  const months = [0, 1, 2].map((i) => monthKey(addMonths(today, -i)))
  const recorded = months
    .map((m) => input.calls.find((c) => monthKey(c.month) === m))
    .filter((c): c is HealthInput['calls'][number] => Boolean(c))
  const decided = recorded.filter((c) => c.status !== 'rescheduled')
  if (!decided.length) return { key: 'calls', label: 'Report calls', points: NEUTRAL, note: 'No report calls recorded in the last 3 months.' }
  const attended = decided.filter((c) => c.status === 'attended').length
  const points = Math.round((25 * attended) / decided.length)
  if (decided.length >= 2 && decided[0].status === 'missed' && decided[1].status === 'missed') {
    flags.push('Missed the last two report calls')
  }
  return { key: 'calls', label: 'Report calls', points, note: `Attended ${attended} of ${decided.length} recorded in the last 3 months.` }
}

function paymentsPart(input: HealthInput, today: Date, flags: string[]): HealthPart {
  let worst = 0
  let owed = 0
  for (const { invoice, balance } of input.invoices) {
    if (!isCollectible(invoice) || balance <= 0.009) continue
    const due = invoiceDueDate(invoice)
    if (!due) continue
    const late = differenceInCalendarDays(today, parseISO(due))
    if (late > 0) {
      worst = Math.max(worst, late)
      owed += balance
    }
  }
  const base = { key: 'payments' as const, label: 'Payments' }
  if (!worst) return { ...base, points: 25, note: 'Nothing overdue.' }
  if (worst > 30) flags.push(`Invoice ${worst} days overdue`)
  const points = worst <= 7 ? 18 : worst <= 14 ? 10 : worst <= 30 ? 5 : 0
  return { ...base, points, note: `AED ${owed.toLocaleString('en-AE', { maximumFractionDigits: 0 })} overdue, the oldest by ${worst} days.` }
}

export function healthBand(score: number): HealthBand {
  return score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'at_risk'
}

export function clientHealth(input: HealthInput): ClientHealth {
  const today = input.today ?? new Date()
  const flags: string[] = []
  const parts = [usagePart(input, today, flags), ticketsPart(input, today, flags), callsPart(input, today, flags), paymentsPart(input, today, flags)]
  const score = parts.reduce((n, p) => n + p.points, 0)
  const band = healthBand(score)
  const renewal = renewalFlag(input.contract, today)
  if (renewal?.kind === 'due' && band !== 'healthy') flags.push(`Renewal in ${renewal.days} days and not fully healthy`)
  return { score, band, parts, flags, churnWarning: band === 'at_risk' || flags.length > 0 }
}

/** The months to ask about on the card: this month and last month, newest first. */
export function reportCallMonths(today: Date = new Date()): { key: string; label: string }[] {
  return [0, 1].map((i) => {
    const d = addMonths(today, -i)
    return { key: monthKey(d), label: format(d, 'MMMM') }
  })
}
