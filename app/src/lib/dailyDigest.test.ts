import { describe, expect, it } from 'vitest'
import {
  buildDigest,
  digestCount,
  digestEmail,
  digestSections,
  digestTargets,
  digestWhatsAppValues,
  type DigestInput,
} from './dailyDigest'
import type { Contract } from './types'

// Thursday 22 October 2026, 08:00 in Dubai.
const now = new Date('2026-10-22T04:00:00Z')

function contract(over: Partial<Contract>): Contract {
  return {
    id: 'c1',
    account_id: 'a1',
    package_id: 'p1',
    option: 'A',
    monthly_fee: 1000,
    setup_fee: 0,
    setup_fee_paid: 0,
    term_start: '2025-12-01',
    term_end: '2026-11-30',
    discount_percent: 0,
    discount_months_left: 0,
    annual_prepay: false,
    status: 'active',
    notes: '',
    created_at: '2025-11-20T00:00:00Z',
    updated_at: '2025-11-20T00:00:00Z',
    ...over,
  }
}

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    now,
    accounts: [
      { id: 'a1', name: 'Acme', type: 'ai_crm_client' },
      { id: 'a2', name: 'Beta', type: 'ai_crm_client' },
      { id: 'p9', name: 'Gulf Oil', type: 'ctrm_prospect' },
    ],
    contracts: [],
    packages: [{ id: 'p1', target_hours: 10 }],
    entries: [],
    tickets: [],
    deals: [],
    ...over,
  }
}

describe('buildDigest', () => {
  it('is empty when nothing needs attention', () => {
    const d = buildDigest(input())
    expect(d.date).toBe('2026-10-22')
    expect(digestCount(d)).toBe(0)
    expect(d.noHours).toBeNull()
  })

  it('lists tickets past or near their reply time, past ones first', () => {
    const d = buildDigest(
      input({
        tickets: [
          { id: 't1', subject: 'Soon', account_id: 'a1', status: 'open', created_at: '2026-10-21T04:00:00Z', sla_due_at: '2026-10-22T05:00:00Z', first_response_at: null },
          { id: 't2', subject: 'Late', account_id: null, status: 'new', created_at: '2026-10-20T04:00:00Z', sla_due_at: '2026-10-21T04:00:00Z', first_response_at: null },
          { id: 't3', subject: 'Fine', account_id: 'a1', status: 'open', created_at: '2026-10-22T03:00:00Z', sla_due_at: '2026-10-24T04:00:00Z', first_response_at: null },
          { id: 't4', subject: 'Closed', account_id: 'a1', status: 'closed', created_at: '2026-10-20T04:00:00Z', sla_due_at: '2026-10-21T04:00:00Z', first_response_at: null },
        ],
      }),
    )
    expect(d.tickets.map((t) => t.name)).toEqual(['Late', 'Soon'])
    expect(d.tickets[0]).toMatchObject({ detail: 'Unknown sender, past its reply time', path: '/support/t2', urgent: true })
    expect(d.tickets[1].detail).toBe('Acme, reply due soon')
  })

  it('lists renewals in the next 60 days and ended terms, soonest first', () => {
    const d = buildDigest(
      input({
        contracts: [
          contract({ id: 'c1', account_id: 'a1', term_end: '2026-12-10' }),
          contract({ id: 'c2', account_id: 'a2', term_end: '2026-10-01' }),
        ],
      }),
    )
    expect(d.renewals.map((r) => r.name)).toEqual(['Beta', 'Acme'])
    expect(d.renewals[0]).toMatchObject({ detail: 'term ended 21 days ago (1 Oct)', urgent: true })
    expect(d.renewals[1]).toMatchObject({ detail: 'renews in 49 days (10 Dec)', urgent: false })
  })

  it('leaves out contracts more than 60 days from renewal', () => {
    const d = buildDigest(input({ contracts: [contract({ term_end: '2027-06-30' })] }))
    expect(d.renewals).toEqual([])
  })

  it('lists overdue CTRM next actions but not closed deals', () => {
    const d = buildDigest(
      input({
        deals: [
          { id: 'd1', account_id: 'p9', stage: 'evaluating', next_action: 'Send the proposal', next_action_date: '2026-10-20' },
          { id: 'd2', account_id: 'p9', stage: 'lost', next_action: 'Nothing', next_action_date: '2026-10-01' },
          { id: 'd3', account_id: 'p9', stage: 'contacted', next_action: 'Call', next_action_date: '2026-10-22' },
        ],
      }),
    )
    expect(d.overdueActions).toEqual([
      { name: 'Gulf Oil', detail: 'Send the proposal, due 20 Oct', path: '/accounts/p9', urgent: true },
    ])
  })

  it('lists clients over hours two months running', () => {
    const d = buildDigest(
      input({
        contracts: [contract({})],
        entries: [
          { account_id: 'a1', date: '2026-09-10', hours: 14 },
          { account_id: 'a1', date: '2026-10-05', hours: 13 },
          { account_id: 'a2', date: '2026-10-05', hours: 40 },
        ],
      }),
    )
    expect(d.overHours).toEqual([
      { name: 'Acme', detail: '14h last month and 13h so far this month, target 10h', path: '/accounts/a1', urgent: true },
    ])
  })

  it('adds the no hours check on Fridays', () => {
    const friday = new Date('2026-10-23T04:00:00Z')
    const d = buildDigest(
      input({
        now: friday,
        contracts: [contract({ account_id: 'a1' }), contract({ id: 'c2', account_id: 'a2' })],
        entries: [{ account_id: 'a2', date: '2026-10-20', hours: 1 }],
      }),
    )
    expect(d.noHours?.map((n) => n.name)).toEqual(['Acme'])
    expect(digestSections(d).at(-1)?.key).toBe('noHours')
  })
})

describe('digest messages', () => {
  const d = buildDigest(
    input({
      contracts: [contract({ term_end: '2026-12-10' })],
      deals: [{ id: 'd1', account_id: 'p9', stage: 'evaluating', next_action: 'Send the proposal', next_action_date: '2026-10-20' }],
    }),
  )

  it('writes a plain email with links', () => {
    const { subject, body } = digestEmail(d, 'https://example.com/RRCentral/')
    expect(subject).toBe('RR Central digest for Thursday 22 October: 2 things need attention')
    expect(body).toContain('Renewals in the next 60 days (1)\n  - Acme: renews in 49 days (10 Dec)\n    https://example.com/RRCentral/accounts/a1')
    expect(body).toContain('Tickets near or past their reply time (0)\n  Every open ticket is on time.')
    expect(body).toContain('Open the dashboard: https://example.com/RRCentral/app')
    expect(body).not.toContain('—')
  })

  it('says all clear when there is nothing', () => {
    expect(digestEmail(buildDigest(input()), 'https://x').subject).toBe('RR Central digest for Thursday 22 October: all clear')
  })

  it('gives WhatsApp template values without new lines', () => {
    const values = digestWhatsAppValues(d)
    expect(values).toEqual(['Thursday 22 October', '0', '1', '1', '0'])
    expect(values.some((v) => /\n/.test(v))).toBe(false)
  })
})

describe('digestTargets', () => {
  it('keeps active, valid and unique emails and numbers', () => {
    const base = { name: '', by_email: true, by_whatsapp: true, active: true }
    expect(
      digestTargets([
        { ...base, email: 'Alfred@RedReach.ae', whatsapp_phone: '+971 50 123 4567' },
        { ...base, email: 'alfred@redreach.ae', whatsapp_phone: '00971501234567' },
        { ...base, email: 'not an email', whatsapp_phone: '123' },
        { ...base, email: 'off@redreach.ae', whatsapp_phone: '971500000000', active: false },
        { ...base, email: 'wa-only@redreach.ae', whatsapp_phone: '971509999999', by_email: false },
      ]),
    ).toEqual({ emails: ['alfred@redreach.ae'], phones: ['971501234567', '971509999999'] })
  })
})
