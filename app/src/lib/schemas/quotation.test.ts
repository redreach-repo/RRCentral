import { describe, expect, it } from 'vitest'
import { parseQuotationForm } from './quotation'

const base = {
  client: 'Acme LLC',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  division_code: '01',
  description: '',
  payment_terms: '',
  delivery_terms: '',
  moq: '',
  notes: '',
  date: '2026-11-13',
  quotation_currency: 'AED',
  payment_currency: 'AED',
  fx_rate: 1,
  discount_percent: 0,
  discount_amount: 0,
  has_line_items: false,
}

describe('parseQuotationForm', () => {
  it('requires client or line items', () => {
    const r = parseQuotationForm({ ...base, client: '', has_line_items: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/client or line items/i)
  })

  it('allows line items without a client on draft', () => {
    const r = parseQuotationForm({ ...base, client: '', has_line_items: true })
    expect(r.ok).toBe(true)
  })

  it('rejects a bad contact email', () => {
    const r = parseQuotationForm({ ...base, contact_email: 'nope' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/email/i)
  })

  it('rejects a non-positive FX rate', () => {
    const r = parseQuotationForm({ ...base, fx_rate: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/FX rate/i)
  })

  it('accepts a valid quote', () => {
    const r = parseQuotationForm(base)
    expect(r.ok).toBe(true)
  })
})
