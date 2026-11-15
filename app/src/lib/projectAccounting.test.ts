import { describe, expect, it } from 'vitest'
import { budgetVariance, projectCostTotal, projectHealth } from './projectAccounting'

describe('projectAccounting', () => {
  it('totals costs and flags budget health', () => {
    expect(projectCostTotal([{ amount_aed: 100 }, { amount_aed: 50.5 }])).toBe(150.5)
    expect(budgetVariance(200, 150)).toBe(50)
    expect(projectHealth(200, 150)).toBe('ok')
    expect(projectHealth(200, 195)).toBe('watch')
    expect(projectHealth(200, 210)).toBe('over')
    expect(projectHealth(null, 10)).toBe('unbudgeted')
  })
})
