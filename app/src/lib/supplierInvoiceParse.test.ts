import { describe, expect, it } from 'vitest'
import { parseSupplierInvoiceText, supplierInvoiceProfit } from './supplierInvoiceParse'

const SAMPLE = `
ACME Uniforms LLC
Tax Invoice
Invoice No: INV-8821
Date: 15/09/2026
TRN: 100123456700003
Description Qty Amount
Polo shirts 75 2,400.00
Subtotal AED 2,400.00
VAT 5% AED 120.00
Grand Total AED 2,520.00
`

describe('supplierInvoiceParse', () => {
  it('extracts vendor, invoice no, date, and VAT totals from UAE-style text', () => {
    const parsed = parseSupplierInvoiceText(SAMPLE, 0.05)
    expect(parsed.vendor).toBe('ACME Uniforms LLC')
    expect(parsed.supplierInvoiceNo).toBe('INV-8821')
    expect(parsed.date).toBe('2026-09-15')
    expect(parsed.trn).toBe('100123456700003')
    expect(parsed.amountExVat).toBe(2400)
    expect(parsed.vatAmount).toBe(120)
    expect(parsed.amountInclusive).toBe(2520)
    expect(parsed.confidence).toBe('high')
  })

  it('back-calculates VAT when only the inclusive total is present', () => {
    const parsed = parseSupplierInvoiceText(
      'Vendor Co\nTax Invoice\nInvoice Number: X9\nDate: 2026-09-01\nTotal Amount AED 1,050.00',
      0.05,
    )
    expect(parsed.amountInclusive).toBe(1050)
    expect(parsed.amountExVat).toBe(1000)
    expect(parsed.vatAmount).toBe(50)
  })

  it('computes profit vs a customer quotation', () => {
    // Customer pays 4535 incl VAT → ex 4319.05; supplier cost 2400 ex → profit 1919.05
    const p = supplierInvoiceProfit({
      quoteAmount: 4535,
      expenseExclusive: 2400,
      expenseVat: 120,
      vatRate: 0.05,
    })
    expect(p.revenueExclusive).toBe(4319.05)
    expect(p.expenseExclusive).toBe(2400)
    expect(p.expenseVat).toBe(120)
    expect(p.profit).toBe(1919.05)
    expect(p.netVatPosition).toBeCloseTo(215.95 - 120, 2)
  })
})
