import { describe, expect, it } from 'vitest'
import { briefFacts, briefNote, buildBrief, type BriefInput } from './callBrief'
import { buildAiRequest, normaliseAiInput, parseQuestions } from './aiAssist'

const input = (over: Partial<BriefInput> = {}): BriefInput => ({
  today: '2026-10-25',
  activities: [
    { kind: 'system', body: 'Quote accepted', created_at: '2026-10-24T09:00:00Z', user_email: 'quote-accept' },
    { kind: 'call', body: 'Talked about   the go live date and training.', created_at: '2026-10-20T09:00:00Z', user_email: 'alfred@redreach.ae' },
    { kind: 'email', body: 'Older email', created_at: '2026-10-01T09:00:00Z', user_email: 'va@redreach.ae' },
  ],
  tickets: [
    { subject: 'Bot not replying', status: 'open', created_at: '2026-10-21T06:00:00Z', sla_due_at: '2026-10-22T06:00:00Z', first_response_at: null },
    { subject: 'Done one', status: 'resolved', created_at: '2026-10-01T06:00:00Z', sla_due_at: null, first_response_at: null },
  ],
  invoices: [
    { reference_number: 'RR-07-1', date: '2026-09-01', amount: 1000, status: 'Sent', payment_status: 'Unpaid', payment_terms: 'Net 7' },
    { reference_number: 'RR-07-2', date: '2026-10-20', amount: 500, status: 'Sent', payment_status: 'Unpaid', payment_terms: 'Net 30' },
    { reference_number: 'RR-07-3', date: '2026-10-01', amount: 900, status: 'Draft', payment_status: 'Unpaid', payment_terms: '' },
    { reference_number: 'RR-07-4', date: '2026-08-01', amount: 300, status: 'Sent', payment_status: 'Paid', payment_terms: '' },
  ],
  payments: [{ invoice_ref: 'RR-07-1', amount: 400 }],
  salesDeals: [{ stage: 'quote_sent', next_action: 'Chase the quote', next_action_date: '2026-10-22', monthly_fee: 4500 }],
  ctrmDeals: [{ stage: 'lost', next_action: '', next_action_date: null }],
  goLive: [
    { title: 'Send logo', done: false, kind: 'golive', due_date: '2026-10-23', owner: 'client', stage: 'discovery', sort: 1, done_at: null },
    { title: 'Build it', done: false, kind: 'task', due_date: '2026-10-01', owner: 'red_reach', stage: 'build', sort: 2, done_at: null },
  ],
  ...over,
})

describe('buildBrief', () => {
  const b = buildBrief(input())
  it('finds the last contact a person logged', () => {
    expect(b.lastContact).toMatchObject({ kind: 'Call', when: '20 Oct 2026', daysAgo: 5, by: 'alfred@redreach.ae' })
    expect(b.lastContact?.summary).toBe('Talked about the go live date and training.')
  })
  it('lists open tickets and unpaid invoices with what is owed', () => {
    expect(b.openTickets).toEqual([{ subject: 'Bot not replying', status: 'Open', opened: '21 Oct 2026', late: true }])
    expect(b.openInvoices).toEqual([
      { reference: 'RR-07-1', balance: 600, due: '2026-09-08', daysLate: 47 },
      { reference: 'RR-07-2', balance: 500, due: '2026-11-19', daysLate: 0 },
    ])
    expect(b.owed).toBe(1100)
  })
  it('shows open deals and leaves lost ones out', () => {
    expect(b.deals).toEqual([{ pipeline: 'AI CRM', stage: 'Quote sent', nextAction: 'Chase the quote', nextDate: '2026-10-22', late: true }])
  })
  it('collects what is overdue', () => {
    expect(b.overdue).toEqual([
      'Invoice RR-07-1: AED 600.00, 47 days late',
      'Ticket "Bot not replying" waiting for a first reply',
      'AI CRM next step "Chase the quote" was due 22 Oct 2026',
      'Go live step "Send logo" (client) was due 23 Oct 2026',
    ])
  })
  it('works for an account with nothing on it', () => {
    const empty = buildBrief(input({ activities: [], tickets: [], invoices: [], payments: [], salesDeals: [], ctrmDeals: [], goLive: [] }))
    expect(empty).toEqual({ lastContact: null, openTickets: [], openInvoices: [], owed: 0, deals: [], overdue: [] })
    expect(briefFacts(empty)).toEqual(['No contact logged yet', 'No open tickets', 'No unpaid invoices', 'Nothing overdue'])
  })
  it('turns into facts and a note', () => {
    const facts = briefFacts(b)
    expect(facts[0]).toMatch(/^Last contact: call 5 days ago/)
    expect(facts).toContain('2 unpaid invoices, AED 1,100.00 owed in all')
    const note = briefNote(b, ['When can you send the logo?'])
    expect(note.split('\n')[0]).toBe('Before the call brief')
    expect(note).toContain('1. When can you send the logo?')
  })
})

describe('call_brief AI request', () => {
  it('asks for three questions from the facts only', () => {
    const input = normaliseAiInput({ feature: 'call_brief', accountName: 'Bright Smile', accountKind: 'AI CRM client', facts: ['No open tickets', ''] })
    expect(input).toEqual({ feature: 'call_brief', accountName: 'Bright Smile', accountKind: 'AI CRM client', facts: ['No open tickets'] })
    const req = buildAiRequest(input!)
    expect(req.system).toMatch(/exactly three questions/)
    expect(req.schema).not.toBeNull()
    expect(req.user).toContain('- No open tickets')
  })
  it('needs facts', () => {
    expect(normaliseAiInput({ feature: 'call_brief', accountName: 'X', facts: [] })).toBeNull()
  })
  it('reads at most three questions and tidies dashes', () => {
    expect(parseQuestions(JSON.stringify({ questions: ['One — two?', 'B?', 'C?', 'D?'] }))).toEqual(['One, two?', 'B?', 'C?'])
    expect(parseQuestions('not json')).toEqual([])
  })
})
