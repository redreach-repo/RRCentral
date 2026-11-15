import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { EXPENSES_CSV_COLUMNS } from './expensesCsv'

describe('EXPENSES_CSV_COLUMNS', () => {
  it('requires date, vendor, and amount', () => {
    const csv = [
      'date,vendor,category,amount,payment_method,notes,quote_ref',
      '2026-11-01,Acme Supplies,Office,120.50,Bank transfer,toner,',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of EXPENSES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, EXPENSES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].vendor).toBe('Acme Supplies')
    expect(ok[0].amount).toBe('120.50')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
