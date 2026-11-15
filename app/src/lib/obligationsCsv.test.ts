import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { OBLIGATIONS_CSV_COLUMNS } from './obligationsCsv'

describe('OBLIGATIONS_CSV_COLUMNS', () => {
  it('requires company_name and title', () => {
    const csv = [
      'company_name,title,owner_party,due_date,status,description,crm_id',
      'Acme,Renew NDA,red_reach,2026-12-01,open,Annual renewal,',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of OBLIGATIONS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, OBLIGATIONS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].company_name).toBe('Acme')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
