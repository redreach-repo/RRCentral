import { describe, expect, it } from 'vitest'
import { parseListIoRow, parseListIoRows } from './schema'

const cols = [
  { key: 'name', label: 'Name', required: true },
  { key: 'note', label: 'Note' },
]

describe('listIo schema', () => {
  it('accepts mapped rows', () => {
    const r = parseListIoRow({ name: 'Acme', note: '' }, cols)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.name).toBe('Acme')
  })

  it('rejects missing required', () => {
    const r = parseListIoRow({ name: '  ', note: 'x' }, cols)
    expect(r.ok).toBe(false)
  })

  it('batches with row numbers', () => {
    const { ok, errors } = parseListIoRows(
      [
        { name: '', note: '' },
        { name: 'Ok', note: 'y' },
      ],
      cols,
    )
    expect(ok).toHaveLength(1)
    expect(errors[0]).toMatch(/^Row 2:/)
  })
})
