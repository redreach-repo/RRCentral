import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import {
  DOCUMENT_LINES_CSV_COLUMNS,
  DOCUMENT_LINES_CSV_HEADERS,
  documentLineRowToDraft,
} from './documentLinesCsv'

describe('DOCUMENT_LINES_CSV_COLUMNS', () => {
  it('accepts DocumentPage export CSV shape', () => {
    const csv = [
      DOCUMENT_LINES_CSV_HEADERS.join(','),
      '1,Widget A,SKU-1,2,100,40,0.05,200,10,210,note',
      '2,,SKU-2,1,50,0,0.05,50,2.5,52.5,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of DOCUMENT_LINES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, DOCUMENT_LINES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].description).toBe('Widget A')
    expect(ok[0].sku).toBe('SKU-1')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)

    const draft = documentLineRowToDraft(ok[0])
    expect(draft.description).toBe('Widget A')
    expect(draft.qty).toBe(2)
    expect(draft.unit_price).toBe(100)
    expect(draft.unit_cost).toBe(40)
    expect(draft.remarks).toBe('note')
  })
})
