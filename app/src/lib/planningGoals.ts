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

export type GoalActualsInput = {
  invoices?: { amount?: number | null; status?: string | null; date?: string | null; created_at?: string | null }[]
  deals?: { created_at?: string | null }[]
  incomeExclusive?: number
  expenseExclusive?: number
}

function inPeriod(iso: string | null | undefined, periodYyyyMm: string): boolean {
  if (!iso || !periodYyyyMm) return false
  return String(iso).slice(0, 7) === periodYyyyMm
}

/** Soft actuals from already-loaded finance rows (Unverified reporting). */
export function actualForGoalMetric(
  metricKey: string,
  periodYyyyMm: string,
  input: GoalActualsInput,
): number {
  const invoices = input.invoices || []
  if (metricKey === 'revenue_aed') {
    return round2(
      invoices
        .filter((i) => {
          const st = String(i.status || '').toLowerCase()
          if (st === 'cancelled' || st === 'canceled' || st === 'draft') return false
          return inPeriod(i.date || i.created_at, periodYyyyMm)
        })
        .reduce((s, i) => s + (Number(i.amount) || 0), 0),
    )
  }
  if (metricKey === 'invoices_sent') {
    return invoices.filter((i) => {
      const st = String(i.status || '').toLowerCase()
      if (st === 'cancelled' || st === 'canceled' || st === 'draft') return false
      return inPeriod(i.date || i.created_at, periodYyyyMm)
    }).length
  }
  if (metricKey === 'new_deals') {
    return (input.deals || []).filter((d) => inPeriod(d.created_at, periodYyyyMm)).length
  }
  if (metricKey === 'gross_profit_aed') {
    return round2((Number(input.incomeExclusive) || 0) - (Number(input.expenseExclusive) || 0))
  }
  return 0
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}
