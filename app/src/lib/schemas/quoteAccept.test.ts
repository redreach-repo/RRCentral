import { describe, expect, it } from 'vitest'
import { parseQuoteAcceptForm } from './quoteAccept'

const now = new Date('2026-11-14T10:00:00Z')

describe('parseQuoteAcceptForm', () => {
  it('rejects short name', () => {
    const r = parseQuoteAcceptForm({ name: 'S', date: '2026-11-14', agreed: true }, now)
    expect(r.ok).toBe(false)
  })

  it('accepts a valid accept form', () => {
    const r = parseQuoteAcceptForm({ name: '  Sara Ali  ', date: '2026-11-14', agreed: true }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.name).toBe('Sara Ali')
  })
})
