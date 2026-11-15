import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { PROJECTS_CSV_COLUMNS } from './projectsCsv'

describe('PROJECTS_CSV_COLUMNS', () => {
  it('requires code and name', () => {
    const csv = [
      'code,name,budget_aed,retention_pct',
      'P-100,Tower fit-out,500000,5',
      ',,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of PROJECTS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, PROJECTS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].code).toBe('P-100')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
