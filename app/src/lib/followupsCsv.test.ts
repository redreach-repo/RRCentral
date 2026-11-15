import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { FOLLOWUPS_CSV_COLUMNS } from './followupsCsv'

describe('FOLLOWUPS_CSV_COLUMNS', () => {
  it('requires company_name and follow_up_date', () => {
    const csv = [
      'company_name,follow_up_date,next_action,owner',
      'Acme LLC,2026-11-20,Call back,Sam',
      ',,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of FOLLOWUPS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, FOLLOWUPS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].company_name).toBe('Acme LLC')
    expect(ok[0].follow_up_date).toBe('2026-11-20')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
