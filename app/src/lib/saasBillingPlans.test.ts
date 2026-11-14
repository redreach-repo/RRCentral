import { describe, expect, it } from 'vitest'
import { planByKey, SAAS_PLANS } from './saasBillingPlans'

describe('SAAS_PLANS', () => {
  it('has starter growth and scale', () => {
    expect(SAAS_PLANS.map((p) => p.key)).toEqual(['starter', 'growth', 'scale'])
    expect(planByKey('growth')?.monthlyAed).toBe(1499)
  })
})
