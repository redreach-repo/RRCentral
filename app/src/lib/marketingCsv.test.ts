import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { MARKETING_CSV_COLUMNS } from './marketingCsv'

describe('MARKETING_CSV_COLUMNS', () => {
  it('requires campaign name', () => {
    const csv = [
      'name,channel,status,starts_on,ends_on,budget_aed,notes',
      'Spring push,email,draft,,,1000,',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of MARKETING_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, MARKETING_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Spring push')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
