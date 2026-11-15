import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { QUOTE_TEMPLATES_CSV_COLUMNS } from './quoteTemplatesCsv'

describe('QUOTE_TEMPLATES_CSV_COLUMNS', () => {
  it('requires name and division_code', () => {
    const csv = [
      'name,division_code,description,items_json',
      'Hospitality starter,02,Base pack,"[]"',
      ',,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of QUOTE_TEMPLATES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, QUOTE_TEMPLATES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Hospitality starter')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
