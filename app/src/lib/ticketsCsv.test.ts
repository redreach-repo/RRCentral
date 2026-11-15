import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { TICKETS_CSV_COLUMNS } from './ticketsCsv'

describe('TICKETS_CSV_COLUMNS', () => {
  it('requires subject and account', () => {
    const csv = [
      'subject,account,priority,channel,details',
      'Printer down,Acme LLC,high,email,Cannot print',
      ',,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of TICKETS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, TICKETS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].subject).toBe('Printer down')
    expect(ok[0].account).toBe('Acme LLC')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
