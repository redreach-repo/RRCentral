import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { PAYMENTS_CSV_COLUMNS } from './paymentsCsv'

describe('PAYMENTS_CSV_COLUMNS', () => {
  it('requires quote_ref, payment_date, and amount_received', () => {
    const csv = [
      'quote_ref,payment_date,amount_received,currency,payment_type,status,transaction_ref,payment_method,client',
      'RR-Q-1,2026-11-01,500,AED,Deposit,Pending,tx1,Bank transfer,Acme',
      ',,,,,,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows).map((row) => {
      const normalized: Record<string, string> = {}
      for (const c of PAYMENTS_CSV_COLUMNS) {
        normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
      }
      return normalized
    })
    const { ok, errors } = parseListIoRows(objects, PAYMENTS_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].quote_ref).toBe('RR-Q-1')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
