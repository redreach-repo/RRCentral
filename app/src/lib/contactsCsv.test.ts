import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { CONTACT_CSV_COLUMNS } from './contactsCsv'

describe('CONTACT_CSV_COLUMNS', () => {
  it('requires name and accepts optional contact fields', () => {
    const csv = [
      'name,role,email,phone,whatsapp,is_primary,marketing_opt_in',
      'Sam,Primary,sam@acme.test,050,,true,yes',
      ',,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of CONTACT_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, CONTACT_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Sam')
    expect(ok[0].marketing_opt_in).toBe('yes')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
