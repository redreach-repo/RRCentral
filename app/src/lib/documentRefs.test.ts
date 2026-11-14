import { describe, expect, it } from 'vitest'
import { invoiceDocumentTitle, invoiceKind, invoiceKindLabel, printsDraftBanner } from './documentRefs'

describe('Proforma / Tax invoice naming', () => {
  it('calls an invoice without its RR reference a Proforma Invoice', () => {
    for (const ref of ['INV-DRAFT-1791536651592', 'inv-draft-1-ab12', '', null, undefined, '  ']) {
      expect(invoiceKind(ref)).toBe('proforma')
      expect(invoiceDocumentTitle(ref)).toBe('PROFORMA INVOICE')
      expect(invoiceKindLabel(ref)).toBe('Proforma invoice')
    }
  })

  it('calls an invoice with its RR reference a Tax Invoice', () => {
    for (const ref of ['RR-03-26012', 'RR-01-26003']) {
      expect(invoiceKind(ref)).toBe('tax')
      expect(invoiceDocumentTitle(ref)).toBe('TAX INVOICE')
      expect(invoiceKindLabel(ref)).toBe('Tax invoice')
    }
  })
})

describe('DRAFT banner on the printed sheet', () => {
  it('never prints on invoices, so a proforma can go to the client', () => {
    expect(printsDraftBanner('invoice', true)).toBe(false)
    expect(printsDraftBanner('invoice', false)).toBe(false)
  })

  it('still prints on draft quotes and delivery notes', () => {
    expect(printsDraftBanner('quote', true)).toBe(true)
    expect(printsDraftBanner('delivery-note', true)).toBe(true)
    expect(printsDraftBanner('quote', false)).toBe(false)
  })
})
