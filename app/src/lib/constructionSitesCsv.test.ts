import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { CONSTRUCTION_SITES_CSV_COLUMNS } from './constructionSitesCsv'

describe('CONSTRUCTION_SITES_CSV_COLUMNS', () => {
  it('requires name', () => {
    const csv = ['name,code,location,status', 'Tower A,S1,Dubai,active', ',,,'].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CONSTRUCTION_SITES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CONSTRUCTION_SITES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Tower A')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
