/** Multi-currency helpers. Threads default display currency remains AED.
 * RR Wanders base/reporting currency is configurable (settings.wandersBaseCurrency)
 * and may be TBC until the owner confirms — do not invent a jurisdiction currency.
 */

export const BASE_CURRENCY = 'AED'

export const SUPPORTED_CURRENCIES = [
  'AED',
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'INR',
  'PHP',
] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const CURRENCY_LABELS: Record<string, string> = {
  AED: 'UAE Dirham',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  INR: 'Indian Rupee',
  PHP: 'Philippine Peso',
}

export type MoneyAmount = {
  amount: number
  currency: string
}

/**
 * Convert foreign amount → base (AED) using a stored rate.
 * Rate meaning: 1 unit of `currency` = `rate` units of base.
 * Example: USD→AED rate 3.67 means 100 USD = 367 AED.
 */
export function toBaseAmount(amount: number, rate: number): number {
  const a = Number(amount) || 0
  const r = Number(rate) || 0
  if (r <= 0) return 0
  return roundMoney(a * r)
}

/** Convert base → foreign using the same rate definition. */
export function fromBaseAmount(baseAmount: number, rate: number): number {
  const a = Number(baseAmount) || 0
  const r = Number(rate) || 0
  if (r <= 0) return 0
  return roundMoney(a / r)
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function formatMoneyAmount(amount: number, currency: string): string {
  const code = (currency || BASE_CURRENCY).toUpperCase()
  const n = roundMoney(amount)
  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${code} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

/** Group amounts by currency — never cross-add. */
export function sumByCurrency(rows: MoneyAmount[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const c = (row.currency || BASE_CURRENCY).toUpperCase()
    out[c] = roundMoney((out[c] || 0) + (Number(row.amount) || 0))
  }
  return out
}

export function netReceived(opts: {
  amountReceived: number
  processingFee?: number
  conversionFee?: number
}): number {
  return roundMoney(
    (Number(opts.amountReceived) || 0) -
      (Number(opts.processingFee) || 0) -
      (Number(opts.conversionFee) || 0),
  )
}

/**
 * Exchange gain/loss in base currency.
 * expectedBase = quoted/invoiced base equivalent
 * actualBase = what was actually received in base after fees
 * Positive = gain for RR Wanders.
 */
export function exchangeGainLoss(expectedBase: number, actualBase: number): number {
  return roundMoney((Number(actualBase) || 0) - (Number(expectedBase) || 0))
}

export function isKnownCurrency(code: string): boolean {
  return SUPPORTED_CURRENCIES.includes(code.toUpperCase() as SupportedCurrency)
}
