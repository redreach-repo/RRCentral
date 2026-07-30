import {
  BASE_CURRENCY,
  exchangeGainLoss,
  netReceived,
  roundMoney,
  sumByCurrency,
  toBaseAmount,
  type MoneyAmount,
} from './currency'
import type { CustomerPayment, CustomerRefund, Quotation, SupplierCommitment } from './types'

export type BookingMoneySnapshot = {
  quotationCurrency: string
  invoicedQuoteCurrency: number
  paidByCurrency: Record<string, number>
  receivedBase: number
  feesBase: number
  customerBalanceQuoteCurrency: number
  customerBalanceBase: number
  supplierByCurrency: Record<string, number>
  supplierBase: number
  conversionFees: number
  fxGainLoss: number
  estimatedGrossProfitBase: number
  actualGrossProfitBase: number
}

/** Snapshot balances for a Wanders booking/quote — currencies kept separate. */
export function buildBookingMoneySnapshot(opts: {
  quote: Pick<
    Quotation,
    | 'amount'
    | 'currency'
    | 'quotation_currency'
    | 'fx_rate'
    | 'base_amount'
    | 'supplier_cost_base'
    | 'estimated_gross_profit_base'
  >
  payments: CustomerPayment[]
  refunds?: CustomerRefund[]
  suppliers?: SupplierCommitment[]
}): BookingMoneySnapshot {
  const quoteCur = (
    opts.quote.quotation_currency ||
    opts.quote.currency ||
    BASE_CURRENCY
  ).toUpperCase()
  const quoteRate = Number(opts.quote.fx_rate) || 1
  const invoiced = Number(opts.quote.amount) || 0
  const invoicedBase =
    Number(opts.quote.base_amount) || toBaseAmount(invoiced, quoteRate)

  const receivedPayments = opts.payments.filter((p) =>
    ['Received', 'Cleared', 'Partially received'].includes(p.status),
  )
  const refunded = opts.refunds || []

  const paidByCurrency = sumByCurrency(
    receivedPayments.map((p) => ({ amount: Number(p.amount_received) || 0, currency: p.currency })),
  )
  // subtract refunds per currency
  for (const r of refunded.filter((x) => ['Refunded', 'Partially refunded'].includes(x.status))) {
    const c = (r.refund_currency || r.original_currency || BASE_CURRENCY).toUpperCase()
    paidByCurrency[c] = roundMoney((paidByCurrency[c] || 0) - (Number(r.amount_refunded) || 0))
  }

  let receivedBase = 0
  let conversionFees = 0
  let processingFees = 0
  for (const p of receivedPayments) {
    const net = netReceived({
      amountReceived: p.amount_received,
      processingFee: p.processing_fee,
      conversionFee: p.conversion_fee,
    })
    const rate = Number(p.fx_rate) || 1
    receivedBase += Number(p.base_amount) || toBaseAmount(net, rate)
    conversionFees += Number(p.conversion_fee) || 0
    processingFees += Number(p.processing_fee) || 0
  }
  for (const r of refunded) {
    receivedBase -= Number(r.base_amount) || 0
    conversionFees += Number(r.conversion_fee) || 0
  }
  receivedBase = roundMoney(receivedBase)
  conversionFees = roundMoney(conversionFees)

  // Outstanding in quote currency: convert each payment into quote currency via base
  let paidInQuoteCurrency = 0
  for (const p of receivedPayments) {
    const net = netReceived({
      amountReceived: p.amount_received,
      processingFee: p.processing_fee,
      conversionFee: p.conversion_fee,
    })
    const base = Number(p.base_amount) || toBaseAmount(net, Number(p.fx_rate) || 1)
    if ((p.currency || '').toUpperCase() === quoteCur) {
      paidInQuoteCurrency += net
    } else if (quoteRate > 0) {
      paidInQuoteCurrency += base / quoteRate
    }
  }
  for (const r of refunded) {
    const base = Number(r.base_amount) || 0
    if ((r.refund_currency || '').toUpperCase() === quoteCur) {
      paidInQuoteCurrency -= Number(r.amount_refunded) || 0
    } else if (quoteRate > 0) {
      paidInQuoteCurrency -= base / quoteRate
    }
  }
  paidInQuoteCurrency = roundMoney(paidInQuoteCurrency)

  const suppliers = opts.suppliers || []
  const supplierByCurrency = sumByCurrency(
    suppliers.map(
      (s): MoneyAmount => ({
        amount: Number(s.amount) || 0,
        currency: s.currency || BASE_CURRENCY,
      }),
    ),
  )
  const supplierBase = roundMoney(
    suppliers.reduce(
      (s, row) =>
        s + (Number(row.base_amount) || toBaseAmount(row.amount, Number(row.fx_rate) || 1)),
      0,
    ),
  )

  const expectedBaseFromPayments = roundMoney(
    receivedPayments.reduce((s, p) => {
      // expected at quote rate for the net foreign received, if paying in quote currency
      if ((p.currency || '').toUpperCase() === quoteCur) {
        const net = netReceived({
          amountReceived: p.amount_received,
          processingFee: p.processing_fee,
          conversionFee: p.conversion_fee,
        })
        return s + toBaseAmount(net, quoteRate)
      }
      // otherwise expected = actual at payment rate (no quote-rate comparison)
      return s + (Number(p.base_amount) || 0)
    }, 0),
  )

  const fxGainLoss = exchangeGainLoss(expectedBaseFromPayments, receivedBase)
  const feesBase = roundMoney(
    toBaseAmount(conversionFees + processingFees, 1), // fees often already in payment currency; store raw + note
  )
  // Prefer explicit fee base if payments carry base fees — use conversion of fee amounts at payment rate
  let feesInBase = 0
  for (const p of receivedPayments) {
    const fee = (Number(p.conversion_fee) || 0) + (Number(p.processing_fee) || 0)
    feesInBase += toBaseAmount(fee, Number(p.fx_rate) || 1)
  }
  feesInBase = roundMoney(feesInBase)

  const supplierCost =
    Number(opts.quote.supplier_cost_base) || supplierBase
  const estimatedGp =
    Number(opts.quote.estimated_gross_profit_base) ||
    roundMoney(invoicedBase - supplierCost)
  const actualGp = roundMoney(receivedBase - supplierCost - feesInBase)

  return {
    quotationCurrency: quoteCur,
    invoicedQuoteCurrency: invoiced,
    paidByCurrency,
    receivedBase,
    feesBase: feesInBase || feesBase,
    customerBalanceQuoteCurrency: roundMoney(invoiced - paidInQuoteCurrency),
    customerBalanceBase: roundMoney(invoicedBase - receivedBase),
    supplierByCurrency,
    supplierBase,
    conversionFees,
    fxGainLoss,
    estimatedGrossProfitBase: estimatedGp,
    actualGrossProfitBase: actualGp,
  }
}

export const PAYMENT_STATUSES = [
  'Expected',
  'Pending',
  'Received',
  'Partially received',
  'Cleared',
  'Failed',
  'Refunded',
  'Partially refunded',
  'Disputed',
] as const

export const PAYMENT_TYPES = ['Deposit', 'Balance', 'Full', 'Extra', 'Other'] as const
