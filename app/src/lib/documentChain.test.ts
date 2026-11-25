import { describe, expect, it } from 'vitest'
import { assembleChain, chainHref, liveQuote, quoteBase, summarizeChain, type DocumentChain } from './documentChain'

const base: DocumentChain = {
  client: 'Sharjah Ready Mix',
  quotes: [
    { id: 'r1', reference_number: 'RR-01-26003-R1', base_reference: 'RR-01-26003', revision: 1, status: 'Awarded', date: '2026-11-20' },
    { id: 'q0', reference_number: 'RR-01-26003', base_reference: 'RR-01-26003', revision: 0, status: 'Superseded', date: '2026-11-01' },
  ],
  pos: [{ id: 'p1', po_number: '4200050362', quotation_id: 'r1', issued_on: '2026-11-25' }],
  dns: [
    { id: 'd2', reference_number: 'DN-01-26002', date: '2026-11-28', quote_ref: 'RR-01-26003-R1', invoice_ref: '' },
    { id: 'd1', reference_number: 'DN-01-26001', date: '2026-11-26', quote_ref: 'RR-01-26003-R1', invoice_ref: 'INV-1' },
  ],
  invoices: [
    { id: 'i1', reference_number: 'INV-1', amount: 1050, status: 'Sent', date: '2026-11-27' },
    { id: 'i9', reference_number: 'INV-9', amount: 500, status: 'Cancelled', date: '2026-11-27' },
  ],
  payments: [
    { id: 'pay1', invoice_ref: 'INV-1', amount: 1000.1, created_at: '2026-11-29' },
    { id: 'pay9', invoice_ref: 'INV-9', amount: 500, created_at: '2026-11-29' },
  ],
}

describe('document chain', () => {
  it('orders revisions and documents and drops duplicates', () => {
    const c = assembleChain({ ...base, pos: [...base.pos, base.pos[0]] })
    expect(c.quotes.map((q) => q.id)).toEqual(['q0', 'r1'])
    expect(c.dns.map((d) => d.id)).toEqual(['d1', 'd2'])
    expect(c.pos).toHaveLength(1)
  })

  it('finds the base number and the live revision', () => {
    expect(quoteBase({ reference_number: 'RR-01-26003-R2' })).toBe('RR-01-26003')
    expect(quoteBase({ reference_number: 'RR-01-26003_revision 1' })).toBe('RR-01-26003')
    expect(quoteBase({ reference_number: 'X', base_reference: 'RR-01-1' })).toBe('RR-01-1')
    expect(liveQuote(assembleChain(base).quotes)?.id).toBe('r1')
  })

  it('totals invoiced, paid and balance, ignoring cancelled invoices', () => {
    const s = summarizeChain(assembleChain(base))
    expect(s.invoiced).toBe(1050)
    expect(s.paid).toBe(1000.1)
    expect(s.balance).toBe(49.9)
    expect(s.gaps).toEqual(['1 delivery note not on an invoice', 'Payment still owed'])
  })

  it('names what is missing', () => {
    const s = summarizeChain({ ...base, quotes: [{ ...base.quotes[0], status: 'Expired' }], pos: [], dns: [], invoices: [], payments: [] })
    expect(s.gaps).toEqual(['No client PO linked yet', 'No delivery note yet'])
    const late = summarizeChain({ ...base, quotes: [{ ...base.quotes[0], status: 'Expired' }], dns: [], invoices: [], payments: [] })
    expect(late.gaps).toEqual(['Quote RR-01-26003-R1 is Expired, not Awarded', 'No delivery note yet'])
    const delivered = summarizeChain({ ...base, invoices: [], payments: [] })
    expect(delivered.gaps).toEqual(['Delivered but not invoiced yet'])
  })

  it('links to each document page', () => {
    expect(chainHref('dn', 'x')).toBe('/document/delivery-note/x')
    expect(chainHref('quote', 'x')).toBe('/document/quote/x')
  })
})
