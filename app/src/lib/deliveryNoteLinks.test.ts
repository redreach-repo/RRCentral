import { describe, expect, it } from 'vitest'
import { invoiceOptionsForNote, noteChainLabel, noteInvoiceRef, poForQuote, poOptionsForNote } from './deliveryNoteLinks'

const pos = [
  { id: 'p1', po_number: '4200050362', quotation_id: 'q1', client_name: 'Sharjah Ready Mix' },
  { id: 'p2', po_number: '4200050400', quotation_id: null, client_name: 'sharjah ready mix' },
  { id: 'p3', po_number: 'X-1', quotation_id: null, client_name: 'Other Co' },
  { id: 'p4', po_number: 'OLD', quotation_id: null, client_name: 'Sharjah Ready Mix', status: 'canceled' },
]

describe('delivery note links', () => {
  it("takes the quote's only PO for a new delivery note", () => {
    expect(poForQuote(pos, 'q1')).toBe('p1')
    expect(poForQuote(pos, 'q9')).toBeNull()
    expect(poForQuote([...pos, { id: 'p5', po_number: 'Y', quotation_id: 'q1', client_name: 'S' }], 'q1')).toBeNull()
    expect(poForQuote(pos, null)).toBeNull()
  })

  it("offers the quote's PO first, then the client's open POs", () => {
    expect(poOptionsForNote(pos, 'Sharjah Ready Mix', 'q1').map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(poOptionsForNote(pos, 'Other Co').map((p) => p.id)).toEqual(['p3'])
  })

  it('offers the invoice with the quote number first, never cancelled ones', () => {
    const inv = [
      { reference_number: 'RR-01-26010', client: 'Sharjah Ready Mix' },
      { reference_number: 'RR-01-26003', client: 'Sharjah Ready Mix' },
      { reference_number: 'RR-01-26011', client: 'Sharjah Ready Mix', status: 'Cancelled' },
      { reference_number: 'RR-01-26012', client: 'Other Co' },
    ]
    expect(invoiceOptionsForNote(inv, 'Sharjah Ready Mix', 'RR-01-26003').map((i) => i.reference_number)).toEqual([
      'RR-01-26003',
      'RR-01-26010',
    ])
  })

  it('finds the invoice: its own link, else the invoice made from its quote', () => {
    const refs = new Set(['RR-01-26003'])
    expect(noteInvoiceRef({ invoice_ref: 'RR-01-26010', quote_ref: 'RR-01-26003' }, refs)).toBe('RR-01-26010')
    expect(noteInvoiceRef({ invoice_ref: '', quote_ref: 'RR-01-26003' }, refs)).toBe('RR-01-26003')
    expect(noteInvoiceRef({ quote_ref: 'RR-01-26004' }, refs)).toBe('')
  })

  it('labels the chain for the list', () => {
    expect(noteChainLabel('4200050362', 'RR-01-26003')).toBe('PO 4200050362 · Invoice RR-01-26003')
    expect(noteChainLabel(null, '')).toBe('Not invoiced')
  })
})
