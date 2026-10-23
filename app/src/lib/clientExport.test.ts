import { describe, expect, it } from 'vitest'
import { EXPORT_TABLES, buildExportZip, exportFileName, prepareRows, tablesFor, toCsv } from './clientExport'
import { LOCAL_STORES } from './localDb'
import { crc32, makeZip } from './zip'

const when = new Date(2026, 10, 2, 9, 30)
const spec = (table: string) => EXPORT_TABLES.find((t) => t.table === table)!

/** Reads the names and contents back out of a stored ZIP. */
function unzip(zip: Uint8Array): Record<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const dec = new TextDecoder()
  const out: Record<string, string> = {}
  let at = 0
  while (v.getUint32(at, true) === 0x04034b50) {
    const size = v.getUint32(at + 18, true)
    const nameLen = v.getUint16(at + 26, true)
    const name = dec.decode(zip.subarray(at + 30, at + 30 + nameLen))
    const data = zip.subarray(at + 30 + nameLen, at + 30 + nameLen + size)
    expect(crc32(data)).toBe(v.getUint32(at + 14, true))
    out[name] = dec.decode(data)
    at += 30 + nameLen + size
  }
  // Central directory then end record.
  expect(v.getUint32(at, true)).toBe(0x02014b50)
  expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50)
  expect(v.getUint16(zip.length - 12, true)).toBe(Object.keys(out).length)
  return out
}

describe('zip', () => {
  it('computes the standard CRC32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('writes files that read back', () => {
    const files = unzip(makeZip([{ name: 'a.txt', data: 'one' }, { name: 'ملف.csv', data: 'دبي' }], when))
    expect(files).toEqual({ 'a.txt': 'one', 'ملف.csv': 'دبي' })
  })
})

describe('client export', () => {
  it('covers tables that exist in local mode', () => {
    for (const t of EXPORT_TABLES) expect(LOCAL_STORES as readonly string[], t.table).toContain(t.table)
  })

  it('the client copy leaves out internal tables, notes and costs', () => {
    const names = tablesFor('client').map((t) => t.table)
    expect(names).toContain('tickets')
    expect(names).not.toContain('account_activities')
    expect(names).not.toContain('ai_usage_log')
    expect(names).not.toContain('time_entries')
    expect(tablesFor('full')).toHaveLength(EXPORT_TABLES.length)

    const acc = prepareRows(spec('accounts'), [{ id: '1', name: 'Smile', notes: 'slow payer', owner_user_id: 'u' }], 'client')
    expect(acc).toEqual([{ id: '1', name: 'Smile' }])
    expect(prepareRows(spec('accounts'), [{ id: '1', notes: 'slow payer' }], 'full')).toEqual([{ id: '1', notes: 'slow payer' }])

    const msgs = [
      { id: 'a', body: 'Hi', is_internal_note: false },
      { id: 'b', body: 'Client is upset', is_internal_note: true },
    ]
    expect(prepareRows(spec('ticket_messages'), msgs, 'client').map((m) => m.id)).toEqual(['a'])
    expect(prepareRows(spec('ticket_messages'), msgs, 'full')).toHaveLength(2)
  })

  it('never exports portal token hashes', () => {
    expect(prepareRows(spec('portal_access'), [{ id: 'p', token_hash: 'abc', label: 'Sara' }], 'full')).toEqual([{ id: 'p', label: 'Sara' }])
  })

  it('writes CSV that spreadsheets read safely', () => {
    const csv = toCsv([
      { a: 'plain', b: 'has, comma' },
      { a: 'say "hi"', c: '=HYPERLINK("x")' },
      { a: -12.5, b: '+971 50 123 4567', c: { x: 1 } },
    ])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'a,b,c',
      'plain,"has, comma",',
      `"say ""hi""",,"'=HYPERLINK(""x"")"`,
      '-12.5,+971 50 123 4567,"{""x"":1}"',
      '',
    ])
  })

  it('builds one ZIP with a README, a CSV per table with rows, and everything.json', () => {
    const data = tablesFor('client').map((s) => ({
      spec: s,
      rows: s.table === 'accounts' ? [{ id: '1', name: 'Smile Dental', notes: 'x' }] : s.table === 'tickets' ? [{ id: 't', subject: 'Help' }] : [],
    }))
    const { zip, counts } = buildExportZip({ name: 'Smile Dental', reference: 'AC-07-26001' }, 'client', data, {
      companyName: 'Red Reach',
      madeBy: 'alfred@redreach.ae',
      when,
    })
    const files = unzip(zip)
    expect(Object.keys(files)).toEqual(['README.txt', 'client-details.csv', 'support-tickets.csv', 'everything.json'])
    expect(files['README.txt']).toContain('Data export for Smile Dental (AC-07-26001)')
    expect(files['README.txt']).toContain('support-tickets.csv: Support tickets, 1 row')
    expect(files['client-details.csv']).not.toContain('notes')
    const json = JSON.parse(files['everything.json'])
    expect(json.kind).toBe('client copy')
    expect(json.accounts).toEqual([{ id: '1', name: 'Smile Dental' }])
    expect(json.ticket_messages).toEqual([])
    expect(counts.find((c) => c.spec.table === 'tickets')?.count).toBe(1)
  })

  it('names the file after the client and date', () => {
    expect(exportFileName({ name: 'Smile & Co', reference: 'AC-07-26001' }, 'client', when)).toBe('AC-07-26001-Smile-Co-data-2026-11-02.zip')
    expect(exportFileName({ name: '', reference: '' }, 'full', when)).toBe('client-data-full-2026-11-02.zip')
  })
})
