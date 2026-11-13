import { describe, expect, it } from 'vitest'
import { parseInvoiceForm } from './invoice'

const base = {
  client: 'Acme LLC',
  vertical: 'RR Threads',
  reference_number: '',
  description: '',
  payment_terms: '',
  delivery_terms: '',
  moq: '',
  notes: '',
  date: '2026-11-13',
  status: 'Draft',
  vat_mode: 'standard' as const,
  vat_percent: '',
}

describe('parseInvoiceForm', () => {
  it('requires a client', () => {
    const r = parseInvoiceForm({ ...base, client: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/client/i)
  })

  it('rejects a bad custom VAT percent', () => {
    const r = parseInvoiceForm({ ...base, vat_mode: 'custom', vat_percent: 'abc' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/VAT/i)
  })

  it('accepts a valid draft', () => {
    const r = parseInvoiceForm(base)
    expect(r.ok).toBe(true)
  })

  it('accepts custom VAT of 5', () => {
    const r = parseInvoiceForm({ ...base, vat_mode: 'custom', vat_percent: '5' })
    expect(r.ok).toBe(true)
  })
})
