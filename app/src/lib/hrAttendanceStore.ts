import { db } from './db'
import { isMissingRelationError } from './errors'
import { withoutSoftDeleted } from './softDelete'
import { isSupabaseConfigured } from './supabaseConfig'
import { defaultHoursForStatus, type AttendanceStatus } from './hrAttendance'

export type HrAttendanceDay = {
  id: string
  employee_id: string
  work_date: string
  status: string
  hours: number
  notes: string
  deleted_at?: string | null
  hr_employees?: { full_name: string; employee_code: string } | null
}

export async function listHrAttendanceDays(
  fromDate?: string,
  opts?: { includeDeleted?: boolean },
): Promise<HrAttendanceDay[]> {
  if (!isSupabaseConfigured()) return []
  let q = db
    .from('hr_attendance_days')
    .select(
      'id, employee_id, work_date, status, hours, notes, deleted_at, hr_employees(full_name, employee_code)',
    )
    .order('work_date', { ascending: false })
    .limit(200)
  if (fromDate) q = q.gte('work_date', fromDate)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  const mapped = (data || []).map((r: HrAttendanceDay) => ({
    ...r,
    hours: Number(r.hours) || 0,
    deleted_at: r.deleted_at ?? null,
  }))
  return opts?.includeDeleted ? mapped : withoutSoftDeleted(mapped)
}

export async function softDeleteHrAttendanceDay(id: string): Promise<void> {
  const { error } = await db
    .from('hr_attendance_days')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreHrAttendanceDay(id: string): Promise<void> {
  const { error } = await db
    .from('hr_attendance_days')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
}

export async function upsertHrAttendanceDay(input: {
  employeeId: string
  workDate: string
  status: AttendanceStatus | string
  hours?: number
  notes?: string
}): Promise<void> {
  const hours =
    input.hours != null ? Number(input.hours) : defaultHoursForStatus(input.status)
  const payload = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    status: input.status,
    hours,
    notes: (input.notes || '').trim(),
  }
  const existing = await db
    .from('hr_attendance_days')
    .select('id')
    .eq('employee_id', input.employeeId)
    .eq('work_date', input.workDate)
    .maybeSingle()
  if (existing.data?.id) {
    const { error } = await db.from('hr_attendance_days').update(payload).eq('id', existing.data.id)
    if (error) throw error
    return
  }
  const { error } = await db.from('hr_attendance_days').insert(payload)
  if (error) throw error
}
