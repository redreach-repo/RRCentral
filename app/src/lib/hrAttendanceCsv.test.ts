import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { HR_ATTENDANCE_CSV_COLUMNS } from './hrAttendanceCsv'

describe('HR_ATTENDANCE_CSV_COLUMNS', () => {
  it('requires employee_code and work_date', () => {
    const csv = [
      'employee_code,work_date,status,hours,notes',
      'E100,2026-11-15,present,8,',
      ',,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of HR_ATTENDANCE_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, HR_ATTENDANCE_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].employee_code).toBe('E100')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
