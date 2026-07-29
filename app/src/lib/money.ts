export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function formatAED(n: number): string {
  const amount = round2(n)
  return `AED ${amount.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function calcLine(qty: number, unitPrice: number, vatRate = 0.05) {
  const amount = round2(Number(qty || 0) * Number(unitPrice || 0))
  const vat_amount = round2(amount * Number(vatRate || 0))
  const line_total = round2(amount + vat_amount)
  return { amount, vat_amount, line_total }
}
