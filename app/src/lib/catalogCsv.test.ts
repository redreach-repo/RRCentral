import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { CATALOG_CSV_COLUMNS } from './catalogCsv'

describe('CATALOG_CSV_COLUMNS', () => {
  it('accepts exported catalog CSV shape', () => {
    const csv = [
      'sku,name,division_code,unit_price,unit_cost,stock_on_hand,active',
      'SKU-1,Widget,01,10,5,3,true',
      ',Missing sku,01,1,1,0,true',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CATALOG_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CATALOG_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].sku).toBe('SKU-1')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
