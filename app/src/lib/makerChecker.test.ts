import { describe, expect, it } from 'vitest'
import { approvalNeedsChecker, nextApprovalStatus, summarizeApproval } from './makerChecker'

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

describe('summarizeApproval', () => {
  it('includes object and amount', () => {
    expect(summarizeApproval({ objectType: 'expense', action: 'pay', amountAed: 120 })).toBe(
      'pay expense · AED 120.00',
    )
  })
})
