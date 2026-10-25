import { describe, expect, it } from 'vitest'
import { buildDigest, digestSections } from './dailyDigest'
import { DEFAULT_STALE_DAYS, itemsFor, staleDays, watchItems, type WatchInput, type WatchRow } from './watchdog'
import type { Contract } from './types'

const now = new Date('2026-11-20T05:00:00Z')

const users = [
  { id: 'u-alfred', email: 'alfred@redreach.ae', name: 'Alfred' },
  { id: 'u-sara', email: 'sara@redreach.ae', name: 'Sara' },
]

function base(over: Partial<WatchInput> = {}): WatchInput {
  return {
    now,
    settings: {},
    users,
    accounts: [
      { id: 'a1', name: 'Clinic LLC', type: 'ai_crm_client', owner_user_id: 'u-sara' },
      { id: 'a2', name: 'Trading House', type: 'ctrm_prospect', owner_user_id: 'u-alfred' },
    ],
    crm: [],
    salesDeals: [],
    ctrmDeals: [],
    invoices: [],
    paid: new Map(),
    tickets: [],
    contracts: [],
    packages: [],
    entries: [],
    ...over,
  }
}

const keys = (input: WatchInput) => watchItems(input).map((i) => i.key)

describe('stale deals, per pipeline', () => {
  it('CRM leads after 21 days without an update, owner matched to a login by name', () => {
    const crm = [
      { id: 'c1', company_name: 'Old Lead', owner: 'Alfred', pipeline_stage: 'Contacted', updated_at: '2026-10-25T09:00:00Z' },
      { id: 'c2', company_name: 'Fresh Lead', owner: 'Alfred', pipeline_stage: 'Lead', updated_at: '2026-11-15T09:00:00Z' },
      { id: 'c3', company_name: 'Won Co', owner: 'Alfred', pipeline_stage: 'Won', updated_at: '2026-01-01T09:00:00Z' },
      { id: 'c4', company_name: 'Outside', owner: 'Bob (agent)', pipeline_stage: 'Quoted', updated_at: '2026-09-01T09:00:00Z' },
    ]
    const items = watchItems(base({ crm }))
    expect(items.map((i) => i.key)).toEqual(['stale_deal:crm:c4', 'stale_deal:crm:c1'])
    const old = items.find((i) => i.key === 'stale_deal:crm:c1')!
    expect(old).toMatchObject({ owner_user_id: 'u-alfred', owner_label: 'Alfred', severity: 'warning', link: '/crm?edit=c1' })
    // No login for the CRM owner text: the text is kept as the label.
    expect(items[0]).toMatchObject({ owner_user_id: null, owner_label: 'Bob (agent)', severity: 'urgent' })
  })

  it('AI CRM sales and CTRM deals after 14 days without a touch, closed deals never', () => {
    const items = keys(
      base({
        salesDeals: [
          { id: 's1', account_id: 'a1', stage: 'quote_sent', owner_user_id: 'u-sara', last_touch_at: '2026-11-01T09:00:00Z' },
          { id: 's2', account_id: 'a1', stage: 'signed', owner_user_id: 'u-sara', last_touch_at: '2026-01-01T09:00:00Z' },
        ],
        ctrmDeals: [
          { id: 't1', account_id: 'a2', stage: 'contacted', owner_user_id: 'u-alfred', last_touch_at: '2026-11-05T09:00:00Z' },
          { id: 't2', account_id: 'a2', stage: 'lost', owner_user_id: 'u-alfred', last_touch_at: '2026-01-01T09:00:00Z' },
          { id: 't3', account_id: 'a2', stage: 'demo_done', owner_user_id: 'u-alfred', last_touch_at: '2026-11-18T09:00:00Z' },
        ],
      }),
    )
    expect(items.sort()).toEqual(['stale_deal:ctrm:t1', 'stale_deal:sales:s1'])
  })

  it('uses the days set on Packages and rates', () => {
    const ctrmDeals = [{ id: 't1', account_id: 'a2', stage: 'contacted' as const, owner_user_id: null, last_touch_at: '2026-11-15T09:00:00Z' }]
    expect(keys(base({ ctrmDeals }))).toEqual([])
    expect(keys(base({ ctrmDeals, settings: { watchStaleDaysCtrm: '5' } }))).toEqual(['stale_deal:ctrm:t1'])
    expect(staleDays({ watchStaleDaysCtrm: 'abc', watchStaleDaysCrm: '0', watchStaleDaysSales: '30' })).toEqual({
      ...DEFAULT_STALE_DAYS,
      sales: 30,
    })
  })
})

describe('overdue invoices', () => {
  const inv = {
    id: 'i1',
    account_id: 'a1',
    client: 'Clinic LLC',
    reference_number: 'RR-03-26010',
    date: '2026-10-20',
    payment_terms: 'Net 7 days',
    status: 'Final',
    payment_status: 'Pending',
    amount: 1050,
  }

  it('lists invoices 3 or more days past due, urgent from 14, owned by the account owner', () => {
    const [item] = watchItems(base({ invoices: [inv] }))
    expect(item).toMatchObject({ key: 'invoice_overdue:i1', severity: 'urgent', owner_user_id: 'u-sara', link: '/invoices' })
    expect(item.reason).toContain('24 days late')
    const recent = { ...inv, id: 'i2', date: '2026-11-09' }
    expect(watchItems(base({ invoices: [recent] }))[0]).toMatchObject({ severity: 'warning' })
    expect(keys(base({ invoices: [{ ...inv, date: '2026-11-12' }] }))).toEqual([])
  })

  it('clears once paid, cancelled or still a draft', () => {
    expect(keys(base({ invoices: [inv], paid: new Map([['RR-03-26010', 1050]]) }))).toEqual([])
    expect(keys(base({ invoices: [{ ...inv, payment_status: 'Paid' }] }))).toEqual([])
    expect(keys(base({ invoices: [{ ...inv, status: 'Draft' }] }))).toEqual([])
  })
})

describe('tickets, hours, renewals and contracts', () => {
  it('tickets near or past their reply time go to the assignee', () => {
    const tickets = [
      { id: 'k1', subject: 'Login broken', account_id: 'a1', status: 'open' as const, assignee_user_id: 'u-alfred',
        created_at: '2026-11-18T05:00:00Z', sla_due_at: '2026-11-19T05:00:00Z', first_response_at: null },
      { id: 'k2', subject: 'Answered', account_id: 'a1', status: 'open' as const, assignee_user_id: null,
        created_at: '2026-11-18T05:00:00Z', sla_due_at: '2026-11-19T05:00:00Z', first_response_at: '2026-11-18T06:00:00Z' },
    ]
    const items = watchItems(base({ tickets }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: 'ticket_sla:k1', severity: 'urgent', owner_user_id: 'u-alfred', link: '/support/k1' })
  })

  const contract = (over: Partial<Contract>) =>
    ({ id: 'k-1', account_id: 'a1', package_id: 'p1', status: 'active', term_start: '2025-12-10', term_end: '2026-12-09',
       created_at: '2025-12-10T00:00:00Z', ...over }) as Contract

  it('renewals within 30 days, and contracts still active after their end date', () => {
    expect(watchItems(base({ contracts: [contract({})] }))[0]).toMatchObject({
      key: 'renewal:k-1', kind: 'renewal', owner_user_id: 'u-sara',
    })
    expect(keys(base({ contracts: [contract({ term_end: '2027-01-30' })] }))).toEqual([])
    expect(watchItems(base({ contracts: [contract({ term_end: '2026-11-10' })] }))[0]).toMatchObject({
      key: 'contract_expired:k-1', kind: 'contract_expired', severity: 'urgent',
    })
    expect(keys(base({ contracts: [contract({ term_end: '2026-11-10', status: 'ended' })] }))).toEqual([])
  })

  it('clients over hours two months running', () => {
    const entries = [
      { account_id: 'a1', date: '2026-10-05', hours: 30 },
      { account_id: 'a1', date: '2026-11-05', hours: 30 },
    ]
    const items = watchItems(base({ contracts: [contract({ term_end: '2027-06-01' })], packages: [{ id: 'p1', target_hours: 10 }], entries }))
    expect(items.map((i) => i.key)).toEqual(['over_hours:a1'])
  })
})

describe('clearing and who sees what', () => {
  it('keys stay the same while the cause lasts, so a fixed item drops out of the next run', () => {
    const tickets = [
      { id: 'k1', subject: 'Late', account_id: 'a1', status: 'open' as const, assignee_user_id: null,
        created_at: '2026-11-18T05:00:00Z', sla_due_at: '2026-11-19T05:00:00Z', first_response_at: null },
    ]
    expect(keys(base({ tickets }))).toEqual(keys(base({ tickets, now: new Date('2026-11-20T09:00:00Z') })))
    expect(keys(base({ tickets: [{ ...tickets[0], first_response_at: '2026-11-20T06:00:00Z' }] }))).toEqual([])
  })

  const row = (over: Partial<WatchRow>): WatchRow =>
    ({ id: 'r', key: 'k', kind: 'renewal', severity: 'warning', title: '', reason: '', link: '', owner_user_id: null,
       owner_label: '', account_id: null, first_seen_at: '', last_seen_at: '', cleared_at: null, ...over })

  it('mine shows my items and the unowned ones, never cleared ones', () => {
    const rows = [
      row({ id: '1', owner_user_id: 'u-sara' }),
      row({ id: '2', owner_user_id: 'u-alfred' }),
      row({ id: '3' }),
      row({ id: '4', owner_user_id: 'u-sara', cleared_at: '2026-11-20T03:30:00Z' }),
    ]
    expect(itemsFor(rows, 'u-sara', true).map((r) => r.id)).toEqual(['1', '3'])
    expect(itemsFor(rows, 'u-sara', false).map((r) => r.id)).toEqual(['1', '2', '3'])
  })
})

describe('08:00 digest', () => {
  it('lists open stale deals and late invoices with their owner', () => {
    const d = buildDigest({
      now,
      accounts: [],
      contracts: [],
      packages: [],
      entries: [],
      tickets: [],
      deals: [],
      watch: [
        { kind: 'invoice_overdue', severity: 'urgent', title: 'Clinic LLC', reason: 'RR-03-26010, 24 days late', link: '/invoices', owner_label: 'Sara' },
        { kind: 'stale_deal', severity: 'warning', title: 'Old Lead', reason: 'no update for 26 days', link: '/crm?edit=c1', owner_label: '' },
        { kind: 'renewal', severity: 'warning', title: 'Ignored', reason: '', link: '', owner_label: '' },
      ],
    })
    expect(d.lateInvoices).toEqual([
      { name: 'Clinic LLC', detail: 'RR-03-26010, 24 days late (Sara)', path: '/invoices', urgent: true },
    ])
    expect(d.staleDeals.map((i) => i.detail)).toEqual(['no update for 26 days'])
    expect(digestSections(d).map((s) => s.key)).toEqual(
      expect.arrayContaining(['lateInvoices', 'staleDeals']),
    )
  })
})
