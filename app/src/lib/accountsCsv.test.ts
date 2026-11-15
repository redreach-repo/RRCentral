import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { ACCOUNT_CSV_COLUMNS } from './accountsCsv'

describe('ACCOUNT_CSV_COLUMNS', () => {
  it('accepts exported account CSV shape with type+name', () => {
    const csv = [
      'name,type,status,industry,country,city,website,source,notes,reference',
      'Acme LLC,rr_threads_client,prospect,,,,,,csv_import,,',
      ',rr_threads_client,,,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of ACCOUNT_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, ACCOUNT_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Acme LLC')
    expect(ok[0].type).toBe('rr_threads_client')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
