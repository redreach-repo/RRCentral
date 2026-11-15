import { describe, expect, it } from 'vitest'
import { creditGate, remainingCredit } from './creditLimits'

describe('creditLimits', () => {
  it('blocks hold and over-limit', () => {
    expect(creditGate({ creditLimitAed: 1000, creditHold: true, openArAed: 0 }).ok).toBe(false)
    expect(creditGate({ creditLimitAed: 1000, creditHold: false, openArAed: 900 }, 200).ok).toBe(false)
    expect(creditGate({ creditLimitAed: 1000, creditHold: false, openArAed: 500 }, 100).ok).toBe(true)
    expect(remainingCredit({ creditLimitAed: 1000, creditHold: false, openArAed: 250 })).toBe(750)
  })
})
