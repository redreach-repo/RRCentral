import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { HR_LEAVE_CSV_COLUMNS } from './hrLeaveCsv'

describe('HR_LEAVE_CSV_COLUMNS', () => {
  it('requires employee_code, starts_on, ends_on', () => {
    const csv = [
      'employee_code,leave_type,starts_on,ends_on,reason',
      'E100,annual,2026-11-20,2026-11-22,Vacation',
      ',,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of HR_LEAVE_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, HR_LEAVE_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].employee_code).toBe('E100')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
