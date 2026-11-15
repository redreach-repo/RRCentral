import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { HR_PEOPLE_CSV_COLUMNS } from './hrPeopleCsv'

describe('HR_PEOPLE_CSV_COLUMNS', () => {
  it('requires full_name and accepts optional directory fields', () => {
    const csv = [
      'full_name,employee_code,email,job_title,department,employment_status',
      'Ada Lovelace,E100,ada@example.test,Engineer,Product,active',
      ',,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of HR_PEOPLE_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, HR_PEOPLE_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].full_name).toBe('Ada Lovelace')
    expect(ok[0].employee_code).toBe('E100')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
