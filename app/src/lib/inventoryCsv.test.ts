import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { INVENTORY_ADJUST_CSV_COLUMNS } from './inventoryCsv'

describe('INVENTORY_ADJUST_CSV_COLUMNS', () => {
  it('requires sku and qty_delta', () => {
    const csv = ['sku,qty_delta,reason,reference', 'TEE-S,5,manual_adjust,csv', ',,,'].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of INVENTORY_ADJUST_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, INVENTORY_ADJUST_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].sku).toBe('TEE-S')
    expect(ok[0].qty_delta).toBe('5')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
