import { describe, expect, it } from 'vitest'
import { buildClient360, divisionOf, filterClientRows, groupQuotes, totalsLine } from './client360'

const today = new Date('2026-11-28T09:00:00Z')

const client = {
  id: 'c1',
  company_name: 'Sharjah Ready Mix Concrete Company L.L.C SP',
  short_name: 'Sharjah Ready Mix',
  trn: '',
  address: 'Al Sajaa, Sharjah, PO Box 2083',
  account_id: 'a1',
  primary_contact: 'Vishraj Sasidharan',
  email: 'purchase@sharjahreadymix.ae',
  contacts: [
    { name: 'Vishraj Sasidharan', email: 'purchase@sharjahreadymix.ae' },
    { name: 'Babu Kanayeri', email: 'techhead@sharjahreadymix.ae' },
  ],
}
const account = { id: 'a1', name: 'Sharjah Ready Mix', reference: 'AC-07-26001', status: 'active', credit_limit_aed: 50000, credit_hold: false }

const quotes = [
  { id: 'q5', reference_number: 'RR-01-26005', status: 'Expired', date: '2026-10-01', amount: 10000, supplier_cost_base: 7000 },
  { id: 'q6', reference_number: 'RR-01-26006', status: 'Sent', date: '2026-10-10', amount: 20000, supplier_cost_base: 15000 },
  { id: 'q7', reference_number: 'RR-01-26007', status: 'Awarded', date: '2026-11-01', amount: 30000, supplier_cost_base: 21000 },
  { id: 'q7r1', reference_number: 'RR-01-26007-R1', base_reference: 'RR-01-26007', revision: 1, status: 'Draft', date: '2026-11-20', amount: 31000 },
]
const invoices = [
  { id: 'i1', reference_number: 'RR-01-26007', status: 'Sent', payment_status: 'Partial', date: '2026-10-01', amount: 31500, payment_terms: '30 days' },
  { id: 'i2', reference_number: 'RR-01-26010', status: 'Draft', payment_status: 'Pending', date: '2026-11-25', amount: 999 },
]
const payments = [{ id: 'p1', invoice_ref: 'RR-01-26007', amount: 10000, created_at: '2026-11-05T10:00:00Z', method: 'Bank' }]

const base = {
  client,
  account,
  quotes,
  invoices,
  payments,
  pos: [{ id: 'po1', po_number: '4200050362', quote_reference: 'RR-01-26007', issued_on: '2026-11-02', amount: 30000, file_url: 'https://drive/x.pdf', file_name: 'PO.pdf' }],
  crmDeals: [{ id: 'd1', company_name: 'Sharjah ReadyMix', pipeline_stage: 'Quoted', created_at: '2026-09-01', owner: 'Alfred' }],
  quoteNotes: [{ id: 'n1', quotation_id: 'q7', kind: 'note', body: 'Met Babu', created_at: '2026-11-03T08:00:00Z', created_by_email: 'alfred@redreach.ae' }],
  today,
  moneyVisible: true,
  marginVisible: true,
}

describe('client 360', () => {
  it('builds the header from the client and its account', () => {
    const v = buildClient360(base)
    expect(v.header).toMatchObject({
      legal_name: 'Sharjah Ready Mix Concrete Company L.L.C SP',
      short_name: 'Sharjah Ready Mix',
      account_reference: 'AC-07-26001',
      credit_limit: 50000,
      credit_hold: false,
      status: 'active',
    })
  })

  it('totals quoted, awarded, invoiced, balance and overdue, ignoring drafts', () => {
    const [t] = buildClient360(base).totals
    expect(t.currency).toBe('AED')
    // 10,000 + 20,000 + 30,000 (the R1 draft does not replace the awarded quote)
    expect(t.quoted).toBe(60000)
    expect(t.awarded).toBe(30000)
    expect(t.invoiced).toBe(31500)
    expect(t.paid).toBe(10000)
    expect(t.balance).toBe(21500)
    // due 31 Oct, so overdue on 28 Nov
    expect(t.overdue).toBe(21500)
    expect(totalsLine(t)).toContain('overdue 21,500.00')
  })

  it('groups revisions under the base reference, current = latest that went out', () => {
    const groups = groupQuotes(quotes, true)
    const g = groups.find((x) => x.base_reference === 'RR-01-26007')!
    expect(g.revisions.map((r) => r.reference)).toEqual(['RR-01-26007-R1', 'RR-01-26007'])
    expect(g.current.reference).toBe('RR-01-26007')
    expect(g.current.margin).toBe(9000)
    expect(groups[0].base_reference).toBe('RR-01-26007')
  })

  it('shows days overdue and balance per invoice, newest first', () => {
    const v = buildClient360(base)
    expect(v.invoices.map((i) => i.reference)).toEqual(['RR-01-26010', 'RR-01-26007'])
    const i = v.invoices.find((x) => x.id === 'i1')!
    expect(i.balance).toBe(21500)
    expect(i.days_overdue).toBe(28)
    expect(v.invoices.find((x) => x.id === 'i2')!.balance).toBe(0)
  })

  it('counts every section and merges the timeline newest first', () => {
    const v = buildClient360(base)
    expect(v.counts).toMatchObject({ quotes: 3, invoices: 2, pos: 1, payments: 1, contacts: 2, inquiries: 1, documents: 1 })
    expect(v.timeline[0].at >= v.timeline[v.timeline.length - 1].at).toBe(true)
    expect(v.timeline.some((x) => x.kind === 'Quote note' && x.ref === 'RR-01-26007')).toBe(true)
  })

  it('leaves money out for people who cannot see it, and margin for locked Sales', () => {
    const staff = buildClient360({ ...base, moneyVisible: false, marginVisible: false })
    expect(staff.totals).toEqual([])
    expect(staff.quotes).toEqual([])
    expect(staff.invoices).toEqual([])
    expect(staff.payments).toEqual([])
    expect(staff.pos[0].amount).toBe(0)
    expect(staff.timeline.some((x) => x.kind === 'Quote note' || x.kind === 'Payment')).toBe(false)
    const sales = buildClient360({ ...base, marginVisible: false })
    expect(sales.quotes.every((g) => g.revisions.every((r) => r.margin === null))).toBe(true)
    expect(sales.totals[0].quoted).toBe(60000)
  })

  it('filters by date range, status and division', () => {
    const v = buildClient360(base)
    expect(filterClientRows(v.invoices, { status: 'draft' }).map((i) => i.id)).toEqual(['i2'])
    expect(filterClientRows(v.invoices, { from: '2026-11-01' }).map((i) => i.id)).toEqual(['i2'])
    expect(filterClientRows(v.quotes, { division: '02' })).toEqual([])
    expect(divisionOf('RR-03-26102')).toBe('03')
  })
})
