import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { DOMAINS_CSV_COLUMNS } from './domainsCsv'

describe('DOMAINS_CSV_COLUMNS', () => {
  it('requires domain_name', () => {
    const csv = [
      'domain_name,registrar,status,expires_on,auto_renew,cost_aed,billing_cycle,notes',
      'example.com,Namecheap,active,2027-01-01,yes,45,annual,',
      ',,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of DOMAINS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, DOMAINS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].domain_name).toBe('example.com')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
