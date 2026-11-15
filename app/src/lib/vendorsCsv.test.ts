import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, parseListIoRows } from './listIo'
import { VENDOR_CSV_COLUMNS } from './vendorsCsv'

describe('VENDOR_CSV_COLUMNS', () => {
  it('accepts exported vendor CSV shape', () => {
    const csv = [
      'company_name,primary_contact,email,mobile,trn',
      'Acme LLC,Sam,sam@acme.test,0501112233,100000000000003',
      ',missing company,,,',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const objects = csvRowsToObjects(headers, rows)
    const { ok, errors } = parseListIoRows(objects, VENDOR_CSV_COLUMNS)
    expect(ok).toHaveLength(1)
    expect(ok[0].company_name).toBe('Acme LLC')
    expect(errors.some((e) => /Row 3/.test(e))).toBe(true)
  })
})
