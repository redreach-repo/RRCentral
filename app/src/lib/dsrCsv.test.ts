import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { DSR_CSV_COLUMNS } from './dsrCsv'

describe('DSR_CSV_COLUMNS', () => {
  it('requires request_type and subject_email', () => {
    const csv = [
      'request_type,subject_email,subject_name,detail',
      'access,person@example.com,Alex,Need copy of data',
      ',,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of DSR_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, DSR_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].subject_email).toBe('person@example.com')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
