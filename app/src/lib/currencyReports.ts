import { BASE_CURRENCY, roundMoney, sumByCurrency, toBaseAmount } from './currency'
import { buildBookingMoneySnapshot } from './bookingMoney'
import type { CustomerPayment, CustomerRefund, Quotation, SupplierCommitment } from './types'

export type CurrencyReport = {
  revenueByCurrency: Record<string, number>
  revenueBase: number
  outstandingByCurrency: Record<string, number>
  outstandingBase: number
  supplierPayablesByCurrency: Record<string, number>
  supplierPayablesBase: number
  conversionFees: number
  conversionFeesBase: number
  fxGainLossBase: number
  estimatedGpByBookingCurrency: Record<string, number>
  estimatedGpBase: number
  actualGpBase: number
  bookingCount: number
}

/** Aggregate multi-currency finance across bookings — never cross-adds currencies. */
export function buildCurrencyReport(opts: {
  quotes: Quotation[]
  payments: CustomerPayment[]
  refunds: CustomerRefund[]
  suppliers: SupplierCommitment[]
}): CurrencyReport {
  const paymentsByBooking = groupBy(opts.payments, (p) => p.booking_id)
  const refundsByBooking = groupBy(opts.refunds, (r) => r.booking_id)
  const suppliersByBooking = groupBy(opts.suppliers, (s) => s.booking_id)

  const revenueByCurrency: Record<string, number> = {}
  const outstandingByCurrency: Record<string, number> = {}
  const estimatedGpByBookingCurrency: Record<string, number> = {}
  let revenueBase = 0
  let outstandingBase = 0
  let conversionFees = 0
  let conversionFeesBase = 0
  let fxGainLossBase = 0
  let estimatedGpBase = 0
  let actualGpBase = 0

  for (const q of opts.quotes) {
    const snap = buildBookingMoneySnapshot({
      quote: q,
      payments: paymentsByBooking.get(q.id) || [],
      refunds: refundsByBooking.get(q.id) || [],
      suppliers: suppliersByBooking.get(q.id) || [],
    })
    const qCur = snap.quotationCurrency
    revenueByCurrency[qCur] = roundMoney((revenueByCurrency[qCur] || 0) + snap.invoicedQuoteCurrency)
    revenueBase +=
      Number(q.base_amount) || toBaseAmount(snap.invoicedQuoteCurrency, Number(q.fx_rate) || 1)

    if (snap.customerBalanceQuoteCurrency !== 0) {
      outstandingByCurrency[qCur] = roundMoney(
        (outstandingByCurrency[qCur] || 0) + snap.customerBalanceQuoteCurrency,
      )
    }
    outstandingBase += snap.customerBalanceBase
    conversionFees += snap.conversionFees
    conversionFeesBase += snap.feesBase
    fxGainLossBase += snap.fxGainLoss
    estimatedGpBase += snap.estimatedGrossProfitBase
    actualGpBase += snap.actualGrossProfitBase
    estimatedGpByBookingCurrency[qCur] = roundMoney(
      (estimatedGpByBookingCurrency[qCur] || 0) + snap.estimatedGrossProfitBase,
    )
  }

  const supplierPayablesByCurrency = sumByCurrency(
    opts.suppliers.map((s) => ({ amount: Number(s.amount) || 0, currency: s.currency })),
  )
  const supplierPayablesBase = roundMoney(
    opts.suppliers.reduce(
      (s, row) => s + (Number(row.base_amount) || toBaseAmount(row.amount, Number(row.fx_rate) || 1)),
      0,
    ),
  )

  return {
    revenueByCurrency,
    revenueBase: roundMoney(revenueBase),
    outstandingByCurrency,
    outstandingBase: roundMoney(outstandingBase),
    supplierPayablesByCurrency,
    supplierPayablesBase,
    conversionFees: roundMoney(conversionFees),
    conversionFeesBase: roundMoney(conversionFeesBase),
    fxGainLossBase: roundMoney(fxGainLossBase),
    estimatedGpByBookingCurrency,
    estimatedGpBase: roundMoney(estimatedGpBase),
    actualGpBase: roundMoney(actualGpBase),
    bookingCount: opts.quotes.length,
  }
}

/** Cash received by original payment currency (separate from invoiced). */
export function cashReceivedByCurrency(payments: CustomerPayment[]): Record<string, number> {
  return sumByCurrency(
    payments
      .filter((p) => ['Received', 'Cleared', 'Partially received'].includes(p.status))
      .map((p) => ({
        amount: Number(p.amount_received) || 0,
        currency: p.currency || BASE_CURRENCY,
      })),
  )
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row) || ''
    const list = map.get(k) || []
    list.push(row)
    map.set(k, list)
  }
  return map
}
