import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { PRODUCTS_CSV_COLUMNS } from './productsCsv'

describe('PRODUCTS_CSV_COLUMNS', () => {
  it('accepts exported WorshipHub churches CSV shape', () => {
    const csv = [
      'name,tenant_slug,plan,billing_status,renewal_date,source,status',
      'Grace Church,grace-church,Pro,active,2027-01-15,manual,active',
      ',missing-name,Pro,active,,manual,active',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of PRODUCTS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, PRODUCTS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Grace Church')
    expect(ok[0].tenant_slug).toBe('grace-church')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
