import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { CTRM_ISSUES_CSV_COLUMNS } from './ctrmIssuesCsv'

describe('CTRM_ISSUES_CSV_COLUMNS', () => {
  it('requires subject', () => {
    const csv = [
      'subject,client,status,vendor_status,vendor_ticket_ref,owner,created_at,client_updated_at',
      'DNS down,Acme,open,waiting,,Alex,2026-11-01,',
      ',,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CTRM_ISSUES_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CTRM_ISSUES_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].subject).toBe('DNS down')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
