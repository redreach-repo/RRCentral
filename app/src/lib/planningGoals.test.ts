import { describe, expect, it } from 'vitest'
import { goalProgressPct, goalStatusFromProgress } from './planningGoals'

describe('planningGoals', () => {
  it('computes progress and status', () => {
    expect(goalProgressPct(50, 100)).toBe(50)
    expect(goalStatusFromProgress(100, false)).toBe('achieved')
    expect(goalStatusFromProgress(40, true)).toBe('missed')
    expect(goalStatusFromProgress(40, false)).toBe('active')
  })
})
