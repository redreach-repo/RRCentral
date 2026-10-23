import { addDays, differenceInCalendarDays, format, parseISO, subMonths } from 'date-fns'
import { calculateOverage, effectiveMonthlyFee, monthKey, monthLabel, type DeliveryRates } from './delivery'
import { isCancelledInvoice } from './finance'
import type { Contract, DeliveryPackage, Invoice, UsageRecord } from './types'

/**
 * Invoices raised from AI CRM contracts, and the reminders sent when they are
 * paid late. Everything here is pure so it can be tested; the database side
 * is in contractBillingStore.ts.
 *
 * Invoices are raised as drafts. Someone still opens each one on Invoices and
 * finalises it, which gives it its RR reference number, before sending it.
 */

export type ContractInvoiceKind = 'setup' | 'monthly'

/** Division the contract invoices are filed under, unless changed on Packages and rates. */
export const CONTRACT_INVOICE_DIVISION_KEY = 'contractInvoiceDivision'
export const DEFAULT_CONTRACT_INVOICE_DIVISION = '03'
export const CONTRACT_INVOICE_TERMS_KEY = 'contractInvoicePaymentTerms'
export const DEFAULT_CONTRACT_INVOICE_TERMS = 'Net 7 days'
export const AUTO_INVOICE_NOTE = 'Raised automatically from the contract.'

export type PlannedLine = { description: string; qty: number; unit_price: number }

export type PlannedInvoice = {
  kind: ContractInvoiceKind
  /** `YYYY-MM-01`. For setup, the month the contract starts. */
  period: string
  description: string
  lines: PlannedLine[]
  /** Excluding VAT. */
  subtotal: number
  /** True when the monthly fee used up one discounted month. */
  usesDiscountMonth: boolean
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

type BillingContract = Pick<
  Contract,
  | 'status'
  | 'term_start'
  | 'term_end'
  | 'monthly_fee'
  | 'setup_fee'
  | 'setup_fee_paid'
  | 'discount_percent'
  | 'discount_months_left'
  | 'annual_prepay'
  | 'option'
  | 'created_at'
> & { auto_invoice?: boolean | null; billing_from?: string | null }

/** The first month the contract is billed monthly. */
export function billingStartMonth(c: BillingContract): string {
  const from = c.billing_from || c.term_start || c.created_at
  return monthKey(from ? String(from) : new Date())
}

/** True when the contract covers any part of the month. Ended contracts still count for their last months. */
export function contractCoversMonth(c: BillingContract, month: string): boolean {
  if (c.status !== 'active' && c.status !== 'ended') return false
  if (c.term_start && monthKey(c.term_start) > month) return false
  if (c.term_end && monthKey(c.term_end) < month) return false
  return true
}

function totalOf(lines: PlannedLine[]): number {
  return round2(lines.reduce((s, l) => s + round2(l.qty * l.unit_price), 0))
}

/** The setup fee invoice, raised once when the contract is signed (saved as active). */
export function setupInvoicePlan(c: BillingContract, packageName: string): PlannedInvoice | null {
  if (!c.auto_invoice || c.status !== 'active') return null
  const due = round2(num(c.setup_fee) - num(c.setup_fee_paid))
  if (due <= 0) return null
  const lines = [{ description: `Setup fee, ${packageName} package`, qty: 1, unit_price: due }]
  return {
    kind: 'setup',
    period: monthKey(c.term_start || c.created_at || new Date()),
    description: `Setup fee, ${packageName} package`,
    lines,
    subtotal: totalOf(lines),
    usesDiscountMonth: false,
  }
}

/**
 * The invoice for `month`: that month's fee (in advance) and the previous
 * month's usage over the plan (in arrears). After the term ends, one last
 * invoice carries the final month's usage only. Nothing is raised for months
 * before the billing start, so turning this on never backfills old months.
 */
export function monthlyInvoicePlan(input: {
  contract: BillingContract
  pkg: Pick<DeliveryPackage, 'name' | 'included_whatsapp' | 'ai_cap_usd' | 'included_lead_credits_usd'> | null
  previousUsage: Pick<
    UsageRecord,
    'whatsapp_marketing_count' | 'whatsapp_service_count' | 'ai_cost_usd' | 'lead_credits_cost_usd'
  > | null
  rates: DeliveryRates
  month: string
}): PlannedInvoice | null {
  const { contract: c, pkg, previousUsage, rates, month } = input
  if (!c.auto_invoice) return null
  const start = billingStartMonth(c)
  if (month < start) return null
  const prev = monthKey(subMonths(parseISO(month), 1))
  const lines: PlannedLine[] = []
  let usesDiscountMonth = false
  const name = pkg?.name ?? 'AI CRM'

  if (c.status === 'active' && contractCoversMonth(c, month) && !c.annual_prepay) {
    const fee = effectiveMonthlyFee(c)
    if (fee > 0) {
      usesDiscountMonth = num(c.discount_months_left) > 0 && num(c.discount_percent) > 0
      const discount = usesDiscountMonth ? ` (${num(c.discount_percent)}% discount)` : ''
      lines.push({ description: `Monthly fee, ${name} package, ${monthLabel(month)}${discount}`, qty: 1, unit_price: fee })
    }
  }

  if (pkg && previousUsage && prev >= start && contractCoversMonth(c, prev)) {
    const o = calculateOverage(previousUsage, pkg, rates)
    const when = monthLabel(prev)
    if (o.marketingOver > 0) {
      lines.push({
        description: `WhatsApp marketing conversations over the plan, ${when}`,
        qty: o.marketingOver,
        unit_price: rates.marketingRateAed,
      })
    }
    if (o.serviceOver > 0) {
      lines.push({
        description: `WhatsApp service conversations over the plan, ${when}`,
        qty: o.serviceOver,
        unit_price: rates.serviceRateAed,
      })
    }
    if (o.aiAed > 0) {
      lines.push({ description: `AI usage over the included amount, ${when}`, qty: 1, unit_price: o.aiAed })
    }
    if (o.leadAed > 0) {
      lines.push({ description: `Lead data credits over the included amount, ${when}`, qty: 1, unit_price: o.leadAed })
    }
  }

  if (lines.length === 0) return null
  const hasFee = lines[0].description.startsWith('Monthly fee')
  return {
    kind: 'monthly',
    period: month,
    description: hasFee ? `${name} package, ${monthLabel(month)}` : `Usage over the plan, ${monthLabel(prev)}`,
    lines,
    subtotal: totalOf(lines),
    usesDiscountMonth,
  }
}

export function withVat(subtotal: number, vatRate: number): number {
  return round2(subtotal + round2(subtotal * vatRate))
}

// ---------------------------------------------------------------------------
// Payment reminders
// ---------------------------------------------------------------------------

export const REMINDER_STAGES = [3, 7, 14] as const
export type ReminderStage = (typeof REMINDER_STAGES)[number]

/** Days allowed by the payment terms text: "Net 30 days" is 30; anything else is due on the invoice date. */
export function paymentTermDays(terms: string | null | undefined): number {
  const m = String(terms || '').match(/net\s*(\d{1,3})/i) || String(terms || '').match(/(\d{1,3})\s*days?/i)
  return m ? Number(m[1]) : 0
}

export function invoiceDueDate(inv: Pick<Invoice, 'date' | 'payment_terms'>): string | null {
  if (!inv.date) return null
  return format(addDays(parseISO(String(inv.date).slice(0, 10)), paymentTermDays(inv.payment_terms)), 'yyyy-MM-dd')
}

/** True for invoices that have gone out and still have money owing. */
export function isCollectible(inv: Pick<Invoice, 'status' | 'payment_status'>): boolean {
  if (isCancelledInvoice(inv)) return false
  if (String(inv.status || '').toLowerCase() === 'draft') return false
  return String(inv.payment_status || '').toLowerCase() !== 'paid'
}

export type DueReminder = { stage: ReminderStage; daysLate: number; dueDate: string }

/**
 * The reminder to send now, if any: the latest stage reached (3, 7 or 14
 * days after the due date) that has not been sent. A missed early stage is
 * skipped rather than sent late.
 */
export function dueReminder(
  inv: Pick<Invoice, 'date' | 'payment_terms' | 'status' | 'payment_status'>,
  balance: number,
  sentStages: number[],
  today: Date = new Date(),
): DueReminder | null {
  if (!isCollectible(inv) || balance <= 0.009) return null
  const dueDate = invoiceDueDate(inv)
  if (!dueDate) return null
  const daysLate = differenceInCalendarDays(today, parseISO(dueDate))
  const reached = REMINDER_STAGES.filter((s) => daysLate >= s)
  if (reached.length === 0) return null
  const stage = reached[reached.length - 1]
  if (sentStages.some((s) => s >= stage)) return null
  return { stage, daysLate, dueDate }
}

export function reminderMessage(input: {
  stage: ReminderStage
  contactName: string
  reference: string
  balanceText: string
  dueDate: string
  daysLate: number
  companyName: string
}): { subject: string; body: string } {
  const due = format(parseISO(input.dueDate), 'd MMMM yyyy')
  const hello = `Dear ${input.contactName || 'team'},`
  const sign = `Best regards,\n${input.companyName}`
  if (input.stage === 3) {
    return {
      subject: `Friendly reminder: invoice ${input.reference}`,
      body: `${hello}\n\nA quick reminder that invoice ${input.reference} for ${input.balanceText} was due on ${due}. If you have already paid, thank you, and please ignore this message.\n\n${sign}`,
    }
  }
  if (input.stage === 7) {
    return {
      subject: `Invoice ${input.reference} is now ${input.daysLate} days overdue`,
      body: `${hello}\n\nInvoice ${input.reference} for ${input.balanceText} is now ${input.daysLate} days past its due date of ${due}. Could you let us know when payment will be made?\n\n${sign}`,
    }
  }
  return {
    subject: `Payment overdue: invoice ${input.reference}`,
    body: `${hello}\n\nInvoice ${input.reference} for ${input.balanceText} is ${input.daysLate} days overdue (due ${due}). Please arrange payment this week. If something is holding it up, reply and we will sort it out together.\n\n${sign}`,
  }
}
