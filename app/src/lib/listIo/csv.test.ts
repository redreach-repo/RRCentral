import { describe, expect, it } from 'vitest'
import { csvRowsToObjects, parseCsv, rowsToCsv, validateMappedRows } from './csv'

describe('listIo csv', () => {
  it('round-trips quotes and commas', () => {
    const csv = rowsToCsv(['Name', 'Note'], [{ Name: 'A, B', Note: 'say "hi"' }])
    const parsed = parseCsv(csv)
    expect(parsed.headers).toEqual(['Name', 'Note'])
    expect(parsed.rows[0]).toEqual(['A, B', 'say "hi"'])
  })

  it('validates required columns', () => {
    const objs = csvRowsToObjects(['Name'], [[''], ['Acme']])
    const { ok, errors } = validateMappedRows(objs, [{ key: 'name', label: 'Name', required: true }])
    expect(ok).toHaveLength(1)
    expect(ok[0].name).toBe('Acme')
    expect(errors[0]).toMatch(/missing Name/)
  })
})
