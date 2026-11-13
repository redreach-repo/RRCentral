import { describe, expect, it } from 'vitest'
import { parseContractInvoiceSettings } from './contractInvoiceSettings'

describe('parseContractInvoiceSettings', () => {
  it('accepts a known division and terms', () => {
    const r = parseContractInvoiceSettings({
      division: '01',
      terms: 'Net 30 days',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.division).toBe('01')
    expect(r.data.terms).toBe('Net 30 days')
  })

  it('rejects unknown division', () => {
    const r = parseContractInvoiceSettings({
      division: '99',
      terms: 'Net 30 days',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/division/i)
  })

  it('rejects unknown payment terms', () => {
    const r = parseContractInvoiceSettings({
      division: '01',
      terms: 'Whenever',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/payment terms/i)
  })
})
