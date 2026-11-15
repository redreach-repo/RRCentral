/** Planning goals stub helpers. */

export const GOAL_METRICS = [
  { key: 'revenue_aed', label: 'Revenue (AED)' },
  { key: 'gross_profit_aed', label: 'Gross profit (AED)' },
  { key: 'new_deals', label: 'New deals' },
  { key: 'invoices_sent', label: 'Invoices sent' },
] as const

export function goalProgressPct(actual: number, target: number): number {
  const t = Number(target) || 0
  if (t <= 0) return 0
  return Math.round(Math.min(999, (Number(actual) / t) * 100))
}

export function goalStatusFromProgress(pct: number, periodEnded: boolean): 'active' | 'achieved' | 'missed' {
  if (pct >= 100) return 'achieved'
  if (periodEnded) return 'missed'
  return 'active'
}

export function currentPeriodYyyyMm(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
