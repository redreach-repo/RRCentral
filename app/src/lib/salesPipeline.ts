import { addMonths, format, parseISO } from 'date-fns'
import { packageFees, termEndFromStart } from './delivery'
import type { ContractInput } from './deliveryStore'
import type { DeliveryPackage, SalesDeal, SalesStage } from './types'

/**
 * The pre-sale pipeline for AI CRM prospects: lead, discovery call, quote
 * sent, signed. A quote is a package, an option and the fees on the deal;
 * "Make contract" turns it into the client's contract in one step.
 */
export const SALES_STAGES: { value: SalesStage; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'discovery_call', label: 'Discovery call' },
  { value: 'quote_sent', label: 'Quote sent' },
  { value: 'signed', label: 'Signed' },
  { value: 'lost', label: 'Lost' },
]

export function salesStageLabel(stage: string): string {
  return SALES_STAGES.find((s) => s.value === stage)?.label ?? stage
}

export function isOpenSalesDeal(d: Pick<SalesDeal, 'stage'>): boolean {
  return d.stage !== 'signed' && d.stage !== 'lost'
}

/** Open deals whose next action date has passed. */
export function isSalesDealOverdue(d: Pick<SalesDeal, 'stage' | 'next_action_date'>, now: Date = new Date()): boolean {
  if (!isOpenSalesDeal(d) || !d.next_action_date) return false
  return d.next_action_date < format(now, 'yyyy-MM-dd')
}

type QuoteFields = Pick<SalesDeal, 'package_id' | 'monthly_fee'>

export function hasQuote(d: QuoteFields): boolean {
  return Boolean(d.package_id) && Number(d.monthly_fee) > 0
}

export type SalesDealDraft = Pick<SalesDeal, 'stage' | 'next_action' | 'next_action_date' | 'lost_reason' | 'contract_id'> &
  QuoteFields

/** The rules a deal must meet before it is saved. Returns a message, or null when it is fine. */
export function salesDealProblem(d: SalesDealDraft): string | null {
  if (d.stage === 'lost' && !d.lost_reason.trim()) return 'Say why the deal was lost'
  if (d.stage === 'quote_sent' && !hasQuote(d)) return 'Pick the package and fees that were quoted'
  if (d.stage === 'signed' && !d.contract_id) return 'Use Make contract to sign a deal, so the contract is created from the quote'
  if (isOpenSalesDeal(d)) {
    if (!d.next_action.trim()) return 'Every open deal needs a next action'
    if (!d.next_action_date) return 'Give the next action a date'
  }
  return null
}

/** Fees for a package and option, ready to put on the quote. */
export function quoteFromPackage(
  pkg: Pick<DeliveryPackage, 'id' | 'monthly_fee_a' | 'setup_fee_b' | 'monthly_fee_b'>,
  option: 'A' | 'B',
): Pick<SalesDeal, 'package_id' | 'option' | 'monthly_fee' | 'setup_fee'> {
  return { package_id: pkg.id, option, ...packageFees(pkg, option) }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** First year value of a quote, excluding VAT: setup fee plus 12 months, less any discount months. */
export function quoteFirstYear(
  d: Pick<SalesDeal, 'monthly_fee' | 'setup_fee' | 'discount_percent' | 'discount_months'>,
): number {
  const monthly = Number(d.monthly_fee) || 0
  const discounted = Math.min(12, Math.max(0, Math.round(Number(d.discount_months) || 0)))
  const share = Math.min(100, Math.max(0, Number(d.discount_percent) || 0)) / 100
  return round2((Number(d.setup_fee) || 0) + monthly * 12 - monthly * share * discounted)
}

export function canMakeContract(d: Pick<SalesDeal, 'stage' | 'contract_id'> & QuoteFields): boolean {
  return isOpenSalesDeal(d) && !d.contract_id && hasQuote(d)
}

/** The first of next month, the usual start for a new contract. */
export function defaultStartDate(now: Date = new Date()): string {
  return format(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), 1), 'yyyy-MM-dd')
}

/** The contract the quote becomes: a 12 month term from the agreed start date. */
export function contractFromQuote(
  d: Pick<
    SalesDeal,
    'package_id' | 'option' | 'monthly_fee' | 'setup_fee' | 'discount_percent' | 'discount_months' | 'start_date' | 'quote_reference'
  >,
  now: Date = new Date(),
): ContractInput {
  const start = d.start_date || defaultStartDate(now)
  const quoted = d.quote_reference.trim() ? `quote ${d.quote_reference.trim()}` : 'the pre-sale quote'
  return {
    package_id: d.package_id,
    option: d.option,
    monthly_fee: Number(d.monthly_fee) || 0,
    setup_fee: Number(d.setup_fee) || 0,
    setup_fee_paid: 0,
    term_start: start,
    term_end: termEndFromStart(start),
    discount_percent: Number(d.discount_percent) || 0,
    discount_months_left: Math.max(0, Math.round(Number(d.discount_months) || 0)),
    annual_prepay: false,
    status: 'active',
    notes: `Made from ${quoted} on ${format(now, 'd MMM yyyy')}.`,
    auto_invoice: false,
    billing_from: null,
  }
}

export type StageTotal = { stage: SalesStage; label: string; count: number; monthly: number }

/** Deals and quoted monthly fees per stage, for the pipeline header. */
export function pipelineTotals(deals: Pick<SalesDeal, 'stage' | 'monthly_fee' | 'package_id'>[]): StageTotal[] {
  return SALES_STAGES.map((s) => {
    const inStage = deals.filter((d) => d.stage === s.value)
    return {
      stage: s.value,
      label: s.label,
      count: inStage.length,
      monthly: round2(inStage.filter(hasQuote).reduce((sum, d) => sum + (Number(d.monthly_fee) || 0), 0)),
    }
  })
}

export function startLabel(start: string | null): string {
  return start ? format(parseISO(start), 'd MMM yyyy') : 'the first of next month'
}
