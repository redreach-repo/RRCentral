/** Legacy AED helpers. Exact: they delegate to the shared money module (lib/money/). */
import { formatMoney, lineMoney, money, roundAmount, toNumber } from './money/index'

export function round2(n: number): number {
  return roundAmount(n, 'AED')
}

export function formatAED(n: number): string {
  return formatMoney(money(round2(n), 'AED'))
}

export function calcLine(qty: number, unitPrice: number, vatRate = 0.05) {
  const l = lineMoney(Number(qty) || 0, Number(unitPrice) || 0, Number(vatRate) || 0, 'AED')
  return { amount: toNumber(l.amount), vat_amount: toNumber(l.vat), line_total: toNumber(l.total) }
}
