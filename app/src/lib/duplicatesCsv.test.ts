import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { DUPLICATES_CSV_COLUMNS, parseDuplicateCsvAction } from './duplicatesCsv'

describe('DUPLICATES_CSV_COLUMNS', () => {
  it('requires kind, keep_id, dup_id and accepts action', () => {
    const csv = [
      'kind,keep_id,dup_id,keep_label,dup_label,reasons,action',
      'account,a1,a2,Acme,Acme Dup,Same name,merge',
      'contact,c1,c2,Ann,Anne,Same email,dismiss',
      ',,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of DUPLICATES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, DUPLICATES_CSV_COLUMNS)
    expect(ok).toHaveLength(2)
    expect(ok[0].action).toBe('merge')
    expect(ok[1].action).toBe('dismiss')
    expect(errors.some((e) => /Row 4/.test(e))).toBe(true)
  })
})

describe('parseDuplicateCsvAction', () => {
  it('maps merge and dismiss aliases', () => {
    expect(parseDuplicateCsvAction('merge')).toBe('merge')
    expect(parseDuplicateCsvAction('Dismiss')).toBe('dismiss')
    expect(parseDuplicateCsvAction('not a duplicate')).toBe('dismiss')
    expect(parseDuplicateCsvAction('')).toBe(null)
    expect(parseDuplicateCsvAction('review')).toBe(null)
  })
})
