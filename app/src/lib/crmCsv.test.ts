import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { CRM_CSV_COLUMNS } from './crmCsv'

describe('CRM_CSV_COLUMNS', () => {
  it('requires company_name and accepts optional stage fields', () => {
    const csv = [
      'company_name,pipeline_stage,company_owner,follow_up_date,next_action,owner,notes',
      'Acme LLC,Lead,Sam,2026-12-01,Call,sam@x.com,hello',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CRM_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CRM_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].company_name).toBe('Acme LLC')
    expect(ok[0].pipeline_stage).toBe('Lead')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
