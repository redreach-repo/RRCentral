import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { PAYROLL_CSV_COLUMNS } from './payrollCsv'

describe('PAYROLL_CSV_COLUMNS', () => {
  it('requires period_yyyy_mm', () => {
    const csv = ['period_yyyy_mm,notes', '2026-11,November run', ','].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of PAYROLL_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, PAYROLL_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].period_yyyy_mm).toBe('2026-11')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
