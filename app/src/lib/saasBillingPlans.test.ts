import { describe, expect, it } from 'vitest'
import {
  nextSubscriptionStatus,
  planByKey,
  SAAS_PLANS,
  seatsOverLimit,
  seatUsageLabel,
} from './saasBillingPlans'

describe('SAAS_PLANS', () => {
  it('has starter growth and scale', () => {
    expect(SAAS_PLANS.map((p) => p.key)).toEqual(['starter', 'growth', 'scale'])
    expect(planByKey('growth')?.monthlyAed).toBe(1499)
  })
})

describe('seatUsageLabel', () => {
  it('formats usage', () => {
    expect(seatUsageLabel(3, 5)).toBe('3 / 5 seats (60%)')
  })
})

describe('seatsOverLimit', () => {
  it('detects overage', () => {
    expect(seatsOverLimit(6, 5)).toBe(true)
    expect(seatsOverLimit(5, 5)).toBe(false)
  })
})

describe('nextSubscriptionStatus', () => {
  it('activates trialing', () => {
    expect(nextSubscriptionStatus('trialing', 'activate')).toBe('active')
  })

  it('cancels active', () => {
    expect(nextSubscriptionStatus('active', 'cancel')).toBe('canceled')
  })

  it('blocks activate after cancel', () => {
    expect(nextSubscriptionStatus('canceled', 'activate')).toBeNull()
  })
})
