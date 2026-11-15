/** HR attendance day helpers (stub — not WPS / labour certified). */

export const ATTENDANCE_STATUSES = ['present', 'absent', 'half', 'leave', 'holiday'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export function defaultHoursForStatus(status: AttendanceStatus | string): number {
  if (status === 'absent' || status === 'holiday' || status === 'leave') return 0
  if (status === 'half') return 4
  return 8
}

export function attendanceLabel(status: string, hours: number): string {
  return `${status} · ${Number(hours).toFixed(1)}h`
}
