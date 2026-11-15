import { describe, expect, it } from 'vitest'
import {
  approvalNeedsChecker,
  canDecideApproval,
  gateMoneyAction,
  nextApprovalStatus,
  summarizeApproval,
} from './makerChecker'

describe('nextApprovalStatus', () => {
  it('moves pending to a terminal state', () => {
    expect(nextApprovalStatus('pending', 'approve')).toBe('approved')
    expect(nextApprovalStatus('pending', 'reject')).toBe('rejected')
    expect(nextApprovalStatus('pending', 'cancel')).toBe('canceled')
  })

  it('blocks decisions on terminal rows', () => {
    expect(nextApprovalStatus('approved', 'reject')).toBeNull()
  })
})

describe('approvalNeedsChecker', () => {
  it('flags amounts at or above the threshold', () => {
    expect(approvalNeedsChecker(4999.99)).toBe(false)
    expect(approvalNeedsChecker(5000)).toBe(true)
  })
})

describe('canDecideApproval', () => {
  it('blocks maker self-approve but allows cancel', () => {
    expect(
      canDecideApproval({ status: 'pending', requestedBy: 'u1', decidedBy: 'u1' }),
    ).toBe(false)
    expect(
      canDecideApproval({ status: 'pending', requestedBy: 'u1', decidedBy: 'u1', decision: 'cancel' }),
    ).toBe(true)
    expect(
      canDecideApproval({ status: 'pending', requestedBy: 'u1', decidedBy: 'u2' }),
    ).toBe(true)
  })
})

describe('gateMoneyAction', () => {
  it('passes small amounts', () => {
    expect(gateMoneyAction({ amountAed: 100 })).toEqual({ ok: true, needsApproval: false })
  })

  it('requires approval for large amounts without prior decision', () => {
    const g = gateMoneyAction({ amountAed: 9000 })
    expect(g.ok).toBe(true)
    if (g.ok) expect(g.needsApproval).toBe(true)
  })

  it('blocks while pending', () => {
    expect(gateMoneyAction({ amountAed: 9000, existingStatus: 'pending' }).ok).toBe(false)
  })
})

describe('summarizeApproval', () => {
  it('includes object and amount', () => {
    expect(summarizeApproval({ objectType: 'expense', action: 'pay', amountAed: 120 })).toBe(
      'pay expense · AED 120.00',
    )
  })
})
