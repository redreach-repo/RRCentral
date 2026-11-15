import { describe, expect, it } from 'vitest'
import { actualForGoalMetric, goalProgressPct, goalStatusFromProgress } from './planningGoals'

describe('planningGoals', () => {
  it('computes progress and status', () => {
    expect(goalProgressPct(50, 100)).toBe(50)
    expect(goalStatusFromProgress(100, false)).toBe('achieved')
    expect(goalStatusFromProgress(40, true)).toBe('missed')
    expect(goalStatusFromProgress(40, false)).toBe('active')
  })

  it('sums revenue actuals for a period', () => {
    expect(
      actualForGoalMetric('revenue_aed', '2026-11', {
        invoices: [
          { amount: 100, status: 'Sent', date: '2026-11-01' },
          { amount: 50, status: 'Draft', date: '2026-11-02' },
          { amount: 20, status: 'Sent', date: '2026-10-01' },
        ],
      }),
    ).toBe(100)
  })
})
