import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { QUOTATIONS_CSV_COLUMNS } from './quotationsCsv'

describe('QUOTATIONS_CSV_COLUMNS', () => {
  it('requires client and accepts optional amount/date', () => {
    const csv = [
      'client,amount,date,valid_until,description,notes,status',
      'Acme LLC,1500,2026-11-01,2026-11-15,Uniforms,,Draft',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of QUOTATIONS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, QUOTATIONS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].client).toBe('Acme LLC')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
