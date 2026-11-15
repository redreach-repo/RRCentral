/** M6 leave request helpers (pure). */

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'canceled'
export type LeaveDecision = 'approve' | 'reject' | 'cancel'

export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'unpaid', 'other']

export function leaveDaysInclusive(startsOn: string, endsOn: string): number {
  const a = Date.parse(`${startsOn}T00:00:00Z`)
  const b = Date.parse(`${endsOn}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.floor((b - a) / 86400000) + 1
}

export function nextLeaveStatus(current: LeaveStatus, decision: LeaveDecision): LeaveStatus | null {
  if (current !== 'pending') return null
  if (decision === 'approve') return 'approved'
  if (decision === 'reject') return 'rejected'
  return 'canceled'
}

export function leaveSummary(input: {
  employeeName: string
  leaveType: LeaveType | string
  startsOn: string
  endsOn: string
  days: number
}): string {
  return `${input.employeeName}: ${input.leaveType} ${input.startsOn}→${input.endsOn} (${input.days}d)`
}
