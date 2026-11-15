import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import { leaveDaysInclusive, type LeaveDecision, type LeaveStatus, type LeaveType } from './hrLeave'

export type HrLeaveRequest = {
  id: string
  employee_id: string
  leave_type: LeaveType | string
  starts_on: string
  ends_on: string
  days: number
  status: LeaveStatus | string
  reason: string
  decision_note: string
  hr_employees?: { full_name: string; employee_code: string } | null
}

export async function listHrLeaveRequests(status?: string): Promise<HrLeaveRequest[]> {
  if (!isSupabaseConfigured()) return []
  let q = db
    .from('hr_leave_requests')
    .select(
      'id, employee_id, leave_type, starts_on, ends_on, days, status, reason, decision_note, hr_employees(full_name, employee_code)',
    )
    .order('starts_on', { ascending: false })
  if (status && status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as HrLeaveRequest[]
}

export async function createHrLeaveRequest(input: {
  employeeId: string
  leaveType: LeaveType
  startsOn: string
  endsOn: string
  reason: string
}): Promise<void> {
  const days = leaveDaysInclusive(input.startsOn, input.endsOn)
  if (days <= 0) throw new Error('End date must be on or after start date')
  const { error } = await db.from('hr_leave_requests').insert({
    employee_id: input.employeeId,
    leave_type: input.leaveType,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    days,
    reason: input.reason.trim(),
    status: 'pending',
  })
  if (error) throw error
}

export async function decideHrLeave(id: string, decision: LeaveDecision, note = ''): Promise<void> {
  const { error } = await db.rpc('rr_hr_leave_decide', {
    p_id: id,
    p_decision: decision,
    p_note: note,
  })
  if (error) throw error
}
