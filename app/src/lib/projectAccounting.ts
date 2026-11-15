/** M9b project cost helpers. */

export type ProjectCostCategory = 'labour' | 'materials' | 'subcontractor' | 'expense' | 'other'

export function projectCostTotal(lines: { amount_aed: number }[]): number {
  return lines.reduce((s, l) => s + (Number(l.amount_aed) || 0), 0)
}

export function budgetVariance(budgetAed: number | null | undefined, spentAed: number): number | null {
  if (budgetAed == null || !Number.isFinite(Number(budgetAed))) return null
  return Number(budgetAed) - spentAed
}

export function projectHealth(
  budgetAed: number | null | undefined,
  spentAed: number,
): 'ok' | 'watch' | 'over' | 'unbudgeted' {
  const v = budgetVariance(budgetAed, spentAed)
  if (v == null) return 'unbudgeted'
  if (v < 0) return 'over'
  if (v < Number(budgetAed) * 0.1) return 'watch'
  return 'ok'
}
