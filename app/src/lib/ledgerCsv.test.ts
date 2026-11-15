import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { LEDGER_COA_CSV_COLUMNS } from './ledgerCsv'

describe('LEDGER_COA_CSV_COLUMNS', () => {
  it('requires code, name, and account_type', () => {
    const csv = [
      'code,name,account_type,is_postable,is_active,notes',
      '7000,Travel expense,expense,true,true,Unverified',
      ',,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of LEDGER_COA_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, LEDGER_COA_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].code).toBe('7000')
    expect(ok[0].account_type).toBe('expense')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
