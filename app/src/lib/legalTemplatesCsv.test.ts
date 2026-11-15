import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { AGREEMENT_TEMPLATES_CSV_COLUMNS, NDA_TEMPLATES_CSV_COLUMNS } from './legalTemplatesCsv'

describe('legal template CSV columns', () => {
  it('requires title and body for NDA rows', () => {
    const csv = ['title,body,status,version', 'NDA draft,"Confidentiality terms…",draft,1', ',,'].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of NDA_TEMPLATES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, NDA_TEMPLATES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].title).toBe('NDA draft')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })

  it('requires title and body for agreement rows', () => {
    const csv = ['title,body,status,version', 'MSA,"Services…",draft,2', ','].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of AGREEMENT_TEMPLATES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, AGREEMENT_TEMPLATES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].title).toBe('MSA')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
