import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { PURCHASE_ORDERS_CSV_COLUMNS } from './purchaseOrdersCsv'

describe('PURCHASE_ORDERS_CSV_COLUMNS', () => {
  it('requires vendor_name', () => {
    const csv = [
      'vendor_name,sku,description,qty,unit_cost,landed_cost_aed,order_date',
      'Acme Fabrics,TEE-S,Tees,10,12.5,5,2026-11-01',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of PURCHASE_ORDERS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, PURCHASE_ORDERS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].vendor_name).toBe('Acme Fabrics')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
