/** M13: FTA-shaped VAT return CSV stub — Unverified, not for filing. */

export type VatReturnBox = {
  box: string
  label: string
  amount: number
}

export type VatReturnTotals = {
  supplies: number
  outputVat: number
  purchases: number
  inputVat: number
  netVat: number
}

export function buildVatReturnBoxes(t: VatReturnTotals): VatReturnBox[] {
  return [
    { box: '1a', label: 'Standard rated supplies (exclusive)', amount: round2(t.supplies) },
    { box: '1b', label: 'Output VAT on standard rated supplies', amount: round2(t.outputVat) },
    { box: '6', label: 'Expenses / purchases (exclusive)', amount: round2(t.purchases) },
    { box: '7', label: 'Input VAT recoverable (stub)', amount: round2(t.inputVat) },
    { box: '9', label: 'Net VAT due / (reclaim)', amount: round2(t.netVat) },
  ]
}

export function vatReturnCsv(periodLabel: string, boxes: VatReturnBox[]): string {
  const lines = [
    'HighMast VAT return stub — DRAFT / Unverified — not for FTA filing',
    `Period,${csv(periodLabel)}`,
    'Box,Label,Amount AED',
    ...boxes.map((b) => `${csv(b.box)},${csv(b.label)},${b.amount.toFixed(2)}`),
  ]
  return lines.join('\n') + '\n'
}

function csv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}
