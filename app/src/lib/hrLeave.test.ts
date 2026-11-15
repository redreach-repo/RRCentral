import { describe, expect, it } from 'vitest'
import { leaveDaysInclusive, leaveSummary, nextLeaveStatus } from './hrLeave'

describe('hrLeave', () => {
  it('counts inclusive calendar days', () => {
    expect(leaveDaysInclusive('2026-11-15', '2026-11-15')).toBe(1)
    expect(leaveDaysInclusive('2026-11-15', '2026-11-17')).toBe(3)
    expect(leaveDaysInclusive('2026-11-17', '2026-11-15')).toBe(0)
  })

  it('advances pending leave only', () => {
    expect(nextLeaveStatus('pending', 'approve')).toBe('approved')
    expect(nextLeaveStatus('pending', 'reject')).toBe('rejected')
    expect(nextLeaveStatus('approved', 'reject')).toBeNull()
  })

  it('summarises a request', () => {
    expect(
      leaveSummary({
        employeeName: 'Maya',
        leaveType: 'annual',
        startsOn: '2026-12-01',
        endsOn: '2026-12-03',
        days: 3,
      }),
    ).toBe('Maya: annual 2026-12-01→2026-12-03 (3d)')
  })
})
