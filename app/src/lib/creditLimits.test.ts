import { describe, expect, it } from 'vitest'
import {
  creditGate,
  creditSnapshotFromAccount,
  creditWarnMessage,
  openArFromInvoices,
  remainingCredit,
} from './creditLimits'

describe('creditLimits', () => {
  it('blocks hold and over-limit', () => {
    expect(creditGate({ creditLimitAed: 1000, creditHold: true, openArAed: 0 }).ok).toBe(false)
    expect(creditGate({ creditLimitAed: 1000, creditHold: false, openArAed: 900 }, 200).ok).toBe(false)
    expect(creditGate({ creditLimitAed: 1000, creditHold: false, openArAed: 500 }, 100).ok).toBe(true)
    expect(remainingCredit({ creditLimitAed: 1000, creditHold: false, openArAed: 250 })).toBe(750)
  })

  it('creditWarnMessage returns reason when over limit', () => {
    expect(creditWarnMessage({ creditLimitAed: 100, creditHold: false, openArAed: 90 }, 20)).toMatch(
      /exceeds credit limit/,
    )
    expect(creditWarnMessage({ creditLimitAed: 100, creditHold: false, openArAed: 10 }, 20)).toBeNull()
  })

  it('openArFromInvoices skips paid and cancelled', () => {
    expect(
      openArFromInvoices([
        { amount: 100, payment_status: 'Pending', status: 'Sent' },
        { amount: 50, payment_status: 'Paid', status: 'Sent' },
        { amount: 25, payment_status: 'Pending', status: 'Cancelled' },
      ]),
    ).toBe(100)
  })

  it('creditSnapshotFromAccount maps account fields', () => {
    expect(
      creditSnapshotFromAccount({ credit_limit_aed: 500, credit_hold: true }, 12),
    ).toEqual({ creditLimitAed: 500, creditHold: true, openArAed: 12 })
  })
})
