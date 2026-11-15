import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { ENG_FOUNDATION_CSV_COLUMNS } from './engFoundationCsv'

describe('ENG_FOUNDATION_CSV_COLUMNS', () => {
  it('requires kind and title', () => {
    const csv = [
      'kind,number,title,discipline,amount_aed',
      'document,DOC-1,Spec sheet,MEP,',
      ',,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of ENG_FOUNDATION_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, ENG_FOUNDATION_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].kind).toBe('document')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
