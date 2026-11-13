import { describe, expect, it } from 'vitest'
import { parseExpenseForm } from './expense'

const base = {
  date: '2026-11-13',
  vendor: 'Acme Supplies',
  category: 'Office',
  amount: 105,
  amount_ex_vat: 100,
  vat_amount: 5,
  charges_vat: true,
  payment_method: 'Bank Transfer',
  references_text: '',
  notes: '',
  quote_ref: '',
  supplier_invoice_no: '',
}

describe('parseExpenseForm', () => {
  it('requires a vendor', () => {
    const r = parseExpenseForm({ ...base, vendor: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/vendor/i)
  })

  it('requires a positive amount', () => {
    const r = parseExpenseForm({ ...base, amount: 0, amount_ex_vat: 0, vat_amount: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/amount/i)
  })

  it('allows a legacy category label', () => {
    const r = parseExpenseForm({ ...base, category: 'Custom legacy' })
    expect(r.ok).toBe(true)
  })

  it('accepts a valid expense', () => {
    const r = parseExpenseForm(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.vendor).toBe('Acme Supplies')
  })
})
