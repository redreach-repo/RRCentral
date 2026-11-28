import { describe, expect, it } from 'vitest'
import {
  ALL_SALES,
  EVERYONE,
  filterSalesDocs,
  makerName,
  salesDocHref,
  sinceIso,
  summarizeByMaker,
  toSalesDocs,
  type TeamMember,
} from './salesDocuments'

const team: TeamMember[] = [
  { email: 'alfred@redreach.ae', name: 'Alfred', role: 'admin' },
  { email: 'Sara@redreach.ae', name: 'Sara', role: 'sales' },
  { email: 'omar@redreach.ae', name: 'Omar', role: 'sales', active: false },
  { email: 'mo@redreach.ae', name: '', role: 'manager' },
]

const docs = toSalesDocs(
  {
    quotes: [
      { id: 'q1', reference_number: 'RR-01-1', client: 'A', amount: 100, quotation_currency: 'USD', status: 'Sent', created_at: '2026-11-27T10:00:00Z', created_by: 'SARA@redreach.ae' },
      { id: 'q2', reference_number: '', quote_id: 'Q-2', client: 'B', amount: 50, status: 'Draft', created_at: '2026-11-20T10:00:00Z', created_by: 'alfred@redreach.ae' },
      { id: 'q3', reference_number: 'RR-01-3', client: 'C', amount: 5, status: 'Draft', created_at: '2026-11-26T10:00:00Z', created_by: 'sara@redreach.ae', deleted_at: '2026-11-27' },
    ],
    invoices: [
      { id: 'i1', reference_number: 'RR-01-1', client: 'A', amount: 105, status: 'Sent', created_at: '2026-11-28T08:00:00Z', created_by: 'omar@redreach.ae' },
    ],
    deliveryNotes: [
      { id: 'd1', reference_number: 'DN-01-1', client: 'A', status: 'Draft', created_at: '2026-10-01T08:00:00Z', created_by: 'sara@redreach.ae' },
    ],
    clientPos: [
      { id: 'p1', po_number: 'PO 7/1', client_id: 'c1', amount: 900, currency: 'AED', status: 'open', created_at: '2026-11-25T08:00:00Z', created_by: 'sara@redreach.ae' },
      { id: 'p2', po_number: 'PO-2', account_id: 'a1', amount: 1, status: 'open', created_at: '2026-11-25T07:00:00Z', created_by: '' },
    ],
  },
  new Map([['a1', 'Account One']]),
  new Map([['c1', 'Client One']]),
)

describe('Made by Sales', () => {
  it('turns rows into documents and leaves archived ones out', () => {
    expect(docs.map((d) => d.id).sort()).toEqual(['d1', 'i1', 'p1', 'p2', 'q1', 'q2'])
    const q2 = docs.find((d) => d.id === 'q2')
    expect(q2?.reference).toBe('Q-2')
    expect(docs.find((d) => d.id === 'q1')?.currency).toBe('USD')
    expect(docs.find((d) => d.id === 'd1')?.amount).toBeNull()
    expect(docs.find((d) => d.id === 'p1')?.client).toBe('Client One')
    expect(docs.find((d) => d.id === 'p2')?.client).toBe('Account One')
  })

  it('All Sales shows only Sales users, leavers too, newest first', () => {
    const out = filterSalesDocs(docs, team, { person: ALL_SALES, kind: 'all', sinceIso: '2026-11-01T00:00:00Z' })
    expect(out.map((d) => d.id)).toEqual(['i1', 'q1', 'p1'])
  })

  it('filters one person, case blind, and one kind', () => {
    const out = filterSalesDocs(docs, team, { person: 'SARA@REDREACH.AE', kind: 'quote', sinceIso: '2026-01-01T00:00:00Z' })
    expect(out.map((d) => d.id)).toEqual(['q1'])
  })

  it('Everyone includes admins and unknown makers', () => {
    const out = filterSalesDocs(docs, team, { person: EVERYONE, kind: 'all', sinceIso: '2026-11-01T00:00:00Z' })
    expect(out.map((d) => d.id)).toContain('q2')
    expect(out.map((d) => d.id)).toContain('p2')
  })

  it('counts per maker, most first', () => {
    const rows = summarizeByMaker(docs, team)
    expect(rows[0].name).toBe('Sara')
    expect(rows[0].counts).toEqual({ quote: 1, invoice: 0, delivery_note: 1, client_po: 1 })
    expect(rows.find((r) => r.email === '')?.name).toBe('Unknown')
  })

  it('names makers by team name, else email', () => {
    expect(makerName('mo@redreach.ae', team)).toBe('mo@redreach.ae')
    expect(makerName('OMAR@redreach.ae', team)).toBe('Omar')
  })

  it('links each document to its page', () => {
    expect(salesDocHref({ kind: 'quote', reference: 'RR-01-1' })).toBe('/quotations?ref=RR-01-1')
    expect(salesDocHref({ kind: 'invoice', reference: 'RR-01-1' })).toBe('/invoices?ref=RR-01-1')
    expect(salesDocHref({ kind: 'delivery_note', reference: 'DN-01-1' })).toBe('/delivery-notes?find=DN-01-1')
    expect(salesDocHref({ kind: 'client_po', reference: 'PO 7/1' })).toBe('/client-pos?ref=PO%207%2F1')
  })

  it('period start is days before now', () => {
    expect(sinceIso(7, new Date('2026-11-28T00:00:00Z'))).toBe('2026-11-21T00:00:00.000Z')
  })
})
