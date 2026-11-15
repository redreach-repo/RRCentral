import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { BUILD_TEMPLATES_CSV_COLUMNS } from './buildTemplatesCsv'

describe('BUILD_TEMPLATES_CSV_COLUMNS', () => {
  it('requires code and name', () => {
    const csv = ['code,name,description,package_id,active', 'BT-1,Starter pack,Base build,,true', ',,'].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of BUILD_TEMPLATES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, BUILD_TEMPLATES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].code).toBe('BT-1')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
