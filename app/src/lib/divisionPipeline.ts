import { DIVISIONS } from './config'
import { isCancelledInvoice, isOpenInvoice } from './finance'
import type { Invoice, Quotation } from './types'

export type DivisionPipelineRow = {
  code: string
  brand: string
  openCount: number
  openAmount: number
  awardedCount: number
  awardedAmount: number
  lostCount: number
  /** awarded ÷ (awarded + not awarded + expired); null until something is decided. */
  winRate: number | null
  avgWonAmount: number
  invoicedAmount: number
  outstandingAmount: number
}

const OPEN = new Set(['Draft', 'Finalized', 'Sent'])
const LOST = new Set(['Not awarded', 'Expired'])

/** Division code from a reference like `RR-01-26003` (→ `01`). */
export function divisionFromReference(reference: string | null | undefined): string | null {
  const m = String(reference || '').match(/^[A-Za-z]+-(\d{2})-/)
  return m ? m[1] : null
}

export function buildDivisionPipeline(quotations: Quotation[], invoices: Invoice[]): DivisionPipelineRow[] {
  return DIVISIONS.map((d) => {
    const quotes = quotations.filter((q) => (q.division_code || '01') === d.code)
    const open = quotes.filter((q) => OPEN.has(q.status))
    const awarded = quotes.filter((q) => q.status === 'Awarded')
    const lost = quotes.filter((q) => LOST.has(q.status))
    const decided = awarded.length + lost.length
    const awardedAmount = sum(awarded)

    const divInvoices = invoices.filter(
      (inv) =>
        (divisionFromReference(inv.reference_number) || '01') === d.code &&
        !isCancelledInvoice(inv) &&
        String(inv.status || '').toLowerCase() !== 'draft',
    )

    return {
      code: d.code,
      brand: d.brand,
      openCount: open.length,
      openAmount: sum(open),
      awardedCount: awarded.length,
      awardedAmount,
      lostCount: lost.length,
      winRate: decided ? awarded.length / decided : null,
      avgWonAmount: awarded.length ? awardedAmount / awarded.length : 0,
      invoicedAmount: sum(divInvoices),
      outstandingAmount: sum(divInvoices.filter(isOpenInvoice)),
    }
  })
}

function sum(rows: { amount?: number | string | null }[]): number {
  return rows.reduce((s, r) => s + Number(r.amount || 0), 0)
}
