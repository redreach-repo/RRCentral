import { describe, expect, it } from 'vitest'
import { parseSupplierInvoiceForm, type SupplierInvoiceFormInput } from './supplierInvoice'

const base: SupplierInvoiceFormInput = {
  date: '2026-11-13',
  vendor: 'Acme Supplies',
  supplier_invoice_no: 'SI-1',
  amount: 1000,
  amount_ex_vat: 952.38,
  vat_amount: 47.62,
  charges_vat: true,
  payment_method: 'Bank Transfer',
  notes: '',
  drive_url: '',
  drive_title: '',
}

describe('parseSupplierInvoiceForm', () => {
  it('requires vendor', () => {
    const r = parseSupplierInvoiceForm({ ...base, vendor: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Vendor/i)
  })

  it('requires an amount', () => {
    const r = parseSupplierInvoiceForm({ ...base, amount: 0, amount_ex_vat: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/total/i)
  })

  it('rejects a non-Drive link for new URLs', () => {
    const r = parseSupplierInvoiceForm({
      ...base,
      drive_url: 'https://workdrive.zoho.com/folder/abc',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Google Drive/i)
  })

  it('allows a legacy existing non-Drive URL unchanged', () => {
    const legacy = 'https://workdrive.zoho.com/folder/abc'
    const r = parseSupplierInvoiceForm({
      ...base,
      drive_url: legacy,
      existing_drive_url: legacy,
    })
    expect(r.ok).toBe(true)
  })

  it('accepts a Drive link and vendor amount', () => {
    const r = parseSupplierInvoiceForm({
      ...base,
      drive_url: 'https://drive.google.com/file/d/1AbC/view?usp=sharing',
      drive_title: ' Invoice.pdf ',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.drive_title).toBe('Invoice.pdf')
      expect(r.data.vendor).toBe('Acme Supplies')
    }
  })
})
