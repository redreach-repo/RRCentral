import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { APPROVALS_CSV_COLUMNS } from './approvalsCsv'

describe('APPROVALS_CSV_COLUMNS', () => {
  it('requires object_type, object_id, action', () => {
    const csv = [
      'object_type,object_id,action,amount_aed',
      'expense,sample-1,pay,15000',
      ',,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of APPROVALS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, APPROVALS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].object_type).toBe('expense')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
