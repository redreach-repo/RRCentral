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
  /** Optional deepen stubs — default 0 */
  zeroRatedSupplies?: number
  exemptSupplies?: number
  adjustments?: number
  /** Optional GL VAT payable peek (informational only) */
  glVatPayable?: number
}

export function buildVatReturnBoxes(t: VatReturnTotals): VatReturnBox[] {
  const zero = round2(t.zeroRatedSupplies || 0)
  const exempt = round2(t.exemptSupplies || 0)
  const adj = round2(t.adjustments || 0)
  const boxes: VatReturnBox[] = [
    { box: '1a', label: 'Standard rated supplies (exclusive)', amount: round2(t.supplies) },
    { box: '1b', label: 'Output VAT on standard rated supplies', amount: round2(t.outputVat) },
    { box: '2a', label: 'Zero-rated supplies (stub)', amount: zero },
    { box: '3', label: 'Exempt supplies (stub)', amount: exempt },
    { box: '6', label: 'Expenses / purchases (exclusive)', amount: round2(t.purchases) },
    { box: '7', label: 'Input VAT recoverable (stub)', amount: round2(t.inputVat) },
    { box: '8a', label: 'VAT adjustments (stub)', amount: adj },
    { box: '9', label: 'Net VAT due / (reclaim)', amount: round2(t.netVat + adj) },
  ]
  if (t.glVatPayable != null && Number.isFinite(Number(t.glVatPayable))) {
    boxes.push({
      box: 'GL',
      label: 'VAT payable balance peek (GL — informational)',
      amount: round2(t.glVatPayable),
    })
  }
  return boxes
}

/** Calendar quarter label e.g. 2026-Q4 from a Date or ISO date string. */
export function vatPeriodLabel(from: Date | string = new Date()): string {
  const d = typeof from === 'string' ? new Date(from) : from
  if (Number.isNaN(d.getTime())) return 'unknown'
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${d.getUTCFullYear()}-Q${q}`
}

export function vatReturnCsv(periodLabel: string, boxes: VatReturnBox[]): string {
  const lines = [
    'HighMast VAT return stub — DRAFT / Unverified — not for FTA filing',
    'See docs/COMPLIANCE_NOTES.md — counsel must verify before any live use',
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
