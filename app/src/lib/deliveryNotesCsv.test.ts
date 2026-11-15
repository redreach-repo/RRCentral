import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { DELIVERY_NOTES_CSV_COLUMNS } from './deliveryNotesCsv'

describe('DELIVERY_NOTES_CSV_COLUMNS', () => {
  it('requires client', () => {
    const csv = [
      'client,quote_ref,status,delivery_date,ship_to,notes',
      'Acme LLC,RR-Q-1,Draft,2026-11-20,Dubai,',
      ',,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of DELIVERY_NOTES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, DELIVERY_NOTES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].client).toBe('Acme LLC')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
