import { describe, expect, it } from 'vitest'
import { parseQuotationFinalizeForm } from './quotationFinalize'

describe('parseQuotationFinalizeForm', () => {
  it('rejects blank client', () => {
    const r = parseQuotationFinalizeForm({ client: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/client/i)
  })

  it('trims client', () => {
    const r = parseQuotationFinalizeForm({ client: '  Acme  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.client).toBe('Acme')
  })
})
