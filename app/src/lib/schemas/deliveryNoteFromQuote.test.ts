import { describe, expect, it } from 'vitest'
import { parseDeliveryNoteFromQuoteForm } from './deliveryNoteFromQuote'

describe('parseDeliveryNoteFromQuoteForm', () => {
  it('rejects blank quote id', () => {
    const r = parseDeliveryNoteFromQuoteForm({ quoteId: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/quotation/i)
  })

  it('accepts an id', () => {
    const r = parseDeliveryNoteFromQuoteForm({ quoteId: '  q-1  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.quoteId).toBe('q-1')
  })
})
