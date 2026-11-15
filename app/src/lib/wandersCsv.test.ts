import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { WANDERS_CSV_COLUMNS } from './wandersCsv'

describe('WANDERS_CSV_COLUMNS', () => {
  it('requires client_name and maps export headers', () => {
    const csv = [
      'client_name,sales_stage,booking_status,destination_country,departure_date,return_date,lead_contact,email,mobile,budget_amount,budget_currency',
      'Acme Tours,New enquiry,Deposit pending,India,2026-12-01,2026-12-10,Alex,alex@example.com,+971500000000,5000,AED',
      ',,,,,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of WANDERS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, WANDERS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].client_name).toBe('Acme Tours')
    expect(ok[0].budget_currency).toBe('AED')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
