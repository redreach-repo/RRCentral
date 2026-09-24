import { VAT_RATE } from './config'
import { round2 } from './lineItems'
import type { Quotation } from './types'

const INACTIVE = new Set(['superseded', 'cancelled', 'canceled', 'not awarded', 'not_awarded', 'lost'])

/** Resolve the shared deal key for a quotation (branch siblings share this). */
export function resolveDealRef(
  quote: Pick<Quotation, 'deal_ref' | 'base_reference' | 'reference_number' | 'quote_id' | 'id'>,
): string {
  return (
    String(quote.deal_ref || '').trim() ||
    String(quote.base_reference || '').trim() ||
    String(quote.reference_number || '').trim() ||
    String(quote.quote_id || '').trim() ||
    String(quote.id || '').trim()
  )
}

export function isActiveDealQuote(q: Pick<Quotation, 'status'>): boolean {
  return !INACTIVE.has(String(q.status || '').trim().toLowerCase())
}

/** Ex-VAT customer revenue for GP / cost share. */
export function quoteRevenueExclusive(
  quote: Pick<Quotation, 'amount' | 'offset_vat'>,
  vatRate = VAT_RATE,
): number {
  const amount = round2(Math.max(0, Number(quote.amount) || 0))
  if (amount <= 0) return 0
  if (quote.offset_vat) return amount
  const rate = Number(vatRate) || 0
  return rate > 0 ? round2(amount / (1 + rate)) : amount
}

export type DealCostShare = {
  quoteId: string
  reference: string
  revenueExclusive: number
  sharePct: number
  costExclusive: number
  profit: number
}

/**
 * Split one supplier invoice (ex-VAT) across sibling quotes by revenue weight.
 * Quotes with zero revenue get 0 cost until they are priced.
 * If every sibling has zero revenue, put the full cost on the first quote.
 */
export function allocateSupplierCostAcrossDeal(
  quotes: Array<Pick<Quotation, 'id' | 'reference_number' | 'quote_id' | 'amount' | 'offset_vat' | 'status'>>,
  supplierExclusive: number,
  vatRate = VAT_RATE,
): DealCostShare[] {
  const cost = round2(Math.max(0, Number(supplierExclusive) || 0))
  const active = quotes.filter(isActiveDealQuote)
  const rows = (active.length ? active : quotes).map((q) => ({
    quoteId: q.id,
    reference: String(q.reference_number || q.quote_id || q.id).trim(),
    revenueExclusive: quoteRevenueExclusive(q, vatRate),
  }))
  const totalRevenue = round2(rows.reduce((s, r) => s + r.revenueExclusive, 0))

  if (totalRevenue <= 0) {
    return rows.map((r, i) => {
      const costExclusive = i === 0 ? cost : 0
      return {
        ...r,
        sharePct: i === 0 && cost > 0 ? 100 : 0,
        costExclusive,
        profit: round2(r.revenueExclusive - costExclusive),
      }
    })
  }

  let allocated = 0
  return rows.map((r, i) => {
    const isLast = i === rows.length - 1
    const sharePct = round2((r.revenueExclusive / totalRevenue) * 100)
    const costExclusive = isLast
      ? round2(Math.max(0, cost - allocated))
      : round2((r.revenueExclusive / totalRevenue) * cost)
    if (!isLast) allocated = round2(allocated + costExclusive)
    return {
      ...r,
      sharePct,
      costExclusive,
      profit: round2(r.revenueExclusive - costExclusive),
    }
  })
}
