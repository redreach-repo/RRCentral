import { describe, expect, it } from 'vitest'
import { buildDocPdfBytes, findReplaceableBulkLinks, isDocAlreadyFiled } from './fileDocsToDrive'
import type { CustomerDocument } from './types'

function doc(partial: Partial<CustomerDocument> & Pick<CustomerDocument, 'category' | 'related_ref' | 'title'>): CustomerDocument {
  return {
    id: '1',
    company_name: 'Acme',
    crm_id: null,
    file_name: '',
    drive_url: 'https://drive.google.com/file/d/x',
    notes: '',
    storage_provider: 'google_drive',
    uploaded_by: 'test',
    uploaded_at: '',
    ...partial,
  }
}

describe('isDocAlreadyFiled', () => {
  it('matches related_ref on quotation or signed_quotation', () => {
    const docs = [doc({ category: 'signed_quotation', related_ref: 'Q-01-26001', title: 'Signed' })]
    expect(isDocAlreadyFiled(docs, { category: 'quotation', relatedRef: 'Q-01-26001' })).toBe(true)
  })

  it('returns false when nothing matches', () => {
    const docs = [doc({ category: 'invoice', related_ref: 'INV-1', title: 'Invoice INV-1' })]
    expect(isDocAlreadyFiled(docs, { category: 'quotation', relatedRef: 'Q-01-26001' })).toBe(false)
  })
})

describe('findReplaceableBulkLinks', () => {
  it('finds prior bulk HTML filings for the same ref', () => {
    const docs = [
      doc({
        id: 'html-1',
        category: 'quotation',
        related_ref: 'Q-01-26001',
        title: 'Quotation Q-01-26001',
        file_name: 'Quote-Q-01-26001.html',
        notes: 'Bulk filed from RR Central · doc_id=abc',
      }),
    ]
    expect(findReplaceableBulkLinks(docs, { category: 'quotation', relatedRef: 'Q-01-26001', docId: 'abc' })).toHaveLength(1)
  })
})

describe('buildDocPdfBytes', () => {
  it('returns a PDF byte stream with client, ref and total', () => {
    const bytes = buildDocPdfBytes({
      kind: 'quotation',
      title: 'Quotation',
      ref: 'Q-01-26001',
      company: 'Mass Allied',
      date: '2026-11-12',
      status: 'Sent',
      description: 'Uniforms',
      currency: 'AED',
      lines: [
        {
          line_no: 1,
          description: 'Polo',
          qty: 10,
          unit_price: 50,
          amount: 500,
          vat_amount: 25,
          line_total: 525,
          remarks: '',
        },
      ],
      subtotal: 500,
      discount: 0,
      vat: 25,
      total: 525,
    })
    const head = String.fromCharCode(...bytes.slice(0, 4))
    expect(head).toBe('%PDF')
    expect(bytes.length).toBeGreaterThan(500)
  })
})
