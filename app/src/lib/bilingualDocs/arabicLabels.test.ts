import { describe, expect, it } from 'vitest'
import { columnLabel, getDivisionQuoteFormat } from '../divisionQuoteFormats'
import { invoiceDocumentTitle } from '../documentRefs'
import { ARABIC_DOC_LABELS, arabicFor } from './arabicLabels'

describe('arabicFor', () => {
  it('translates titles and labels, leaving rate or currency to the English half', () => {
    expect(arabicFor('TAX INVOICE')).toBe('فاتورة ضريبية')
    expect(arabicFor('Subtotal')).toBe('المجموع الفرعي')
    expect(arabicFor('Date:')).toBe('التاريخ')
    expect(arabicFor('VAT (5%)')).toBe('ضريبة القيمة المضافة')
    expect(arabicFor('Total (AED)')).toBe('الإجمالي')
  })
  it('returns empty for unknown or custom text', () => {
    expect(arabicFor('CUSTOM CLIENT PROPOSAL')).toBe('')
    expect(arabicFor('')).toBe('')
    expect(arabicFor('(5%)')).toBe('')
  })
  it('covers every built-in title, column and section heading', () => {
    const missing: string[] = []
    for (const ref of ['RR-01-26003', '']) if (!arabicFor(invoiceDocumentTitle(ref))) missing.push(invoiceDocumentTitle(ref))
    const cols = ['sku', 'description', 'sizes', 'qty', 'unit', 'unit_price', 'amount', 'vat', 'total', 'hours', 'rate', 'period'] as const
    for (const c of cols) if (!arabicFor(columnLabel(c))) missing.push(columnLabel(c))
    for (const code of ['01', '02', '03', '04', '05', '06']) {
      const f = getDivisionQuoteFormat(code, {})
      for (const s of [f.documentTitle, ...Object.values(f.sectionHeadings)]) if (!arabicFor(s)) missing.push(s)
    }
    expect([...new Set(missing)]).toEqual([])
  })
  it('every Arabic value is Arabic script', () => {
    for (const [en, ar] of Object.entries(ARABIC_DOC_LABELS)) {
      expect(/[؀-ۿ]/.test(ar), en).toBe(true)
    }
  })
})
