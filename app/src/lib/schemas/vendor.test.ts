import { describe, expect, it } from 'vitest'
import { parseVendorForm } from './vendor'

const base = {
  company_name: 'Acme Supplies LLC',
  primary_contact: 'Sam',
  email: '',
  mobile: '',
  office: '',
  address: '',
  trn: '',
  website: '',
  payment_terms: '',
  notes: '',
}

describe('parseVendorForm', () => {
  it('requires a company name', () => {
    const r = parseVendorForm({ ...base, company_name: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/company name/i)
  })

  it('accepts a minimal vendor', () => {
    const r = parseVendorForm(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.company_name).toBe('Acme Supplies LLC')
  })

  it('rejects a bad email', () => {
    const r = parseVendorForm({ ...base, email: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/email/i)
  })

  it('rejects a short TRN', () => {
    const r = parseVendorForm({ ...base, trn: '12345' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/TRN/i)
  })

  it('normalises TRN spaces', () => {
    const r = parseVendorForm({ ...base, trn: '100 286214 000003' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.trn).toBe('100286214000003')
  })
})
