import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { CLAUSE_LIBRARY_CSV_COLUMNS } from './clauseLibraryCsv'

describe('CLAUSE_LIBRARY_CSV_COLUMNS', () => {
  it('requires clause_key, title, and body', () => {
    const csv = [
      'clause_key,title,body,category,status,sort_order,notes',
      'recipient_care,Recipient care,Protect recipient data.,confidentiality,draft,10,',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CLAUSE_LIBRARY_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CLAUSE_LIBRARY_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].clause_key).toBe('recipient_care')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
