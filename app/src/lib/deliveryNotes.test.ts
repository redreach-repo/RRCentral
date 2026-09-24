import { describe, expect, it } from 'vitest'
import type { LineItem, Quotation } from './types'
import {
  buildDeliveryNoteRow,
  canCreateDeliveryNoteFromQuote,
  deliveryNoteTotalQty,
  nextDeliveryNoteReference,
  parseDocumentType,
  toDeliveryNoteLineDrafts,
} from './deliveryNotes'

function quote(partial: Partial<Quotation> = {}): Pick<
  Quotation,
  | 'client'
  | 'vertical'
  | 'division_code'
  | 'reference_number'
  | 'quote_id'
  | 'description'
  | 'delivery_terms'
  | 'notes'
  | 'status'
> {
  return {
    client: 'Acme Trading',
    vertical: 'RR Threads',
    division_code: '01',
    reference_number: 'RR-01-26004',
    quote_id: 'Q-1',
    description: 'Staff uniforms',
    delivery_terms: '2 weeks',
    notes: 'Call on arrival',
    status: 'Awarded',
    ...partial,
  }
}

function line(partial: Partial<LineItem> = {}): LineItem {
  return {
    id: 'li-1',
    doc_type: 'Quote',
    reference: 'Q-1',
    line_no: 1,
    description: 'Polo shirt',
    qty: 12,
    unit_price: 45,
    unit_cost: 20,
    vat_rate: 0.05,
    amount: 540,
    vat_amount: 27,
    line_total: 567,
    remarks: '',
    sku: 'POL-01',
    sizes_json: { M: 6, L: 6 },
    created_at: '2026-09-01T00:00:00.000Z',
    ...partial,
  }
}

describe('delivery notes from quotations', () => {
  it('parses document route types', () => {
    expect(parseDocumentType('quote')).toBe('quote')
    expect(parseDocumentType('invoice')).toBe('invoice')
    expect(parseDocumentType('delivery-note')).toBe('delivery-note')
    expect(parseDocumentType('delivery_note')).toBe('delivery-note')
    expect(parseDocumentType('dn')).toBe('delivery-note')
    expect(parseDocumentType('')).toBe('quote')
  })

  it('allows delivery notes only from finalized quotations', () => {
    expect(canCreateDeliveryNoteFromQuote(quote({ status: 'Awarded' }))).toBe(true)
    expect(canCreateDeliveryNoteFromQuote(quote({ status: 'Sent' }))).toBe(true)
    expect(canCreateDeliveryNoteFromQuote(quote({ status: 'Finalized' }))).toBe(true)
    expect(canCreateDeliveryNoteFromQuote(quote({ status: 'Draft' }))).toBe(false)
    expect(canCreateDeliveryNoteFromQuote(quote({ status: 'Awarded', reference_number: '' }))).toBe(
      false,
    )
  })

  it('copies quote lines without prices', () => {
    const drafts = toDeliveryNoteLineDrafts([line()])
    expect(drafts).toHaveLength(1)
    expect(drafts[0].description).toBe('Polo shirt')
    expect(drafts[0].qty).toBe(12)
    expect(drafts[0].sku).toBe('POL-01')
    expect(drafts[0].unit_price).toBe(0)
    expect(drafts[0].unit_cost).toBe(0)
  })

  it('builds a delivery note linked to the quotation', () => {
    const row = buildDeliveryNoteRow({
      quote: quote(),
      referenceNumber: 'DN-01-26001',
      who: 'alfred@redreach.ae',
      shipTo: 'Dubai warehouse',
      date: '2026-09-24',
    })
    expect(row.reference_number).toBe('DN-01-26001')
    expect(row.quote_ref).toBe('RR-01-26004')
    expect(row.quote_id).toBe('Q-1')
    expect(row.client).toBe('Acme Trading')
    expect(row.ship_to).toBe('Dubai warehouse')
    expect(row.delivery_terms).toBe('2 weeks')
    expect(row.status).toBe('Issued')
    expect(row.date).toBe('2026-09-24')
  })

  it('sequences delivery-note references per division', () => {
    const yy = String(new Date().getFullYear()).slice(-2)
    expect(nextDeliveryNoteReference('01', [`DN-01-${yy}001`, `RR-01-${yy}099`], 'DN')).toBe(
      `DN-01-${yy}002`,
    )
  })

  it('sums delivered quantities', () => {
    expect(deliveryNoteTotalQty([{ qty: 12 }, { qty: 3 }, { qty: 0 }])).toBe(15)
  })
})
