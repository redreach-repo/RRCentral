import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { CTRM_DEALS_CSV_COLUMNS } from './ctrmDealsCsv'

describe('CTRM_DEALS_CSV_COLUMNS', () => {
  it('requires company', () => {
    const csv = [
      'company,stage,region,company_type,owner,next_action,next_action_date,last_touch_at',
      'Acme Logistics,demo_done,uae,importer,Alex,Send proposal,2026-11-20,2026-11-10',
      ',,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CTRM_DEALS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CTRM_DEALS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].company).toBe('Acme Logistics')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
