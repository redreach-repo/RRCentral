import { describe, expect, it } from 'vitest'
import {
  buildDealRows,
  dealAccess,
  dealSources,
  dealTotals,
  filterDeals,
  sortDeals,
  type DealFilters,
  type MyDealsInput,
} from './myDeals'

const now = new Date('2026-11-20T08:00:00Z')

const users = [
  { id: 'u-alfred', email: 'alfred@redreach.ae', name: 'Alfred' },
  { id: 'u-sara', email: 'sara@redreach.ae', name: 'Sara' },
]

function input(over: Partial<MyDealsInput> = {}): MyDealsInput {
  return {
    now,
    users,
    accounts: [
      { id: 'a1', name: 'Clinic LLC', source: 'Referral' },
      { id: 'a2', name: 'Trading House', source: '' },
    ],
    crm: [
      {
        id: 'c1',
        company_name: 'Mass Allied Freighters L.L.C',
        owner: 'Sara',
        pipeline_stage: 'Quoted',
        next_action: 'Follow up on quote',
        follow_up_date: '2026-11-18',
        quote_ref: '',
        updated_at: '2026-11-10T08:00:00Z',
        created_at: '2026-10-01T08:00:00Z',
        stage_changed_at: '2026-11-05T08:00:00Z',
      },
    ],
    salesDeals: [
      {
        id: 's1',
        account_id: 'a1',
        stage: 'quote_sent',
        source: '',
        owner_user_id: 'u-alfred',
        next_action: 'Call back',
        next_action_date: '2026-11-25',
        monthly_fee: 1000,
        setup_fee: 2000,
        discount_percent: 0,
        discount_months: 0,
        quote_sent_at: '2026-11-15T08:00:00Z',
        signed_at: null,
        created_at: '2026-11-01T08:00:00Z',
        stage_changed_at: null,
      },
    ],
    ctrmDeals: [
      {
        id: 'd1',
        account_id: 'a2',
        stage: 'decision_pending',
        source: 'LinkedIn',
        owner_user_id: null,
        next_action: 'Chase decision',
        next_action_date: null,
        company_type: 'trading_house',
        created_at: '2026-09-01T08:00:00Z',
        stage_changed_at: null,
      },
    ],
    ctrmStageChanges: [
      { deal_id: 'd1', to_stage: 'evaluating', changed_at: '2026-10-01T08:00:00Z' },
      { deal_id: 'd1', to_stage: 'decision_pending', changed_at: '2026-11-10T08:00:00Z' },
    ],
    commissions: [{ deal_id: 'd1', expected_commission: 40000 }],
    quotations: [
      { client: 'Mass Allied Freighters LLC', reference_number: 'RR-01-26003', status: 'Sent', amount: 4535, base_amount: 4535, division_code: '01' },
      { client: 'Mass Allied Freighters', reference_number: 'RR-01-26004', status: 'Not awarded', amount: 999, base_amount: 0, division_code: '01' },
      { client: 'Someone Else', reference_number: 'RR-02-26001', status: 'Sent', amount: 100, base_amount: 0, division_code: '02' },
    ],
    salesDivision: '03',
    canSeeCommission: true,
    ...over,
  }
}

const all: DealFilters = { owner: 'all', pipeline: 'all', source: 'all', division: 'all', showClosed: false }
const byKey = (rows: ReturnType<typeof buildDealRows>) => new Map(rows.map((r) => [r.key, r]))

describe('buildDealRows', () => {
  it('puts the three pipelines in one list with value, weighted value and days in stage', () => {
    const rows = byKey(buildDealRows(input()))
    const crm = rows.get('crm:c1')!
    expect(crm).toMatchObject({
      account: 'Mass Allied Freighters L.L.C',
      deal: 'RR-01-26003',
      stageLabel: 'Quoted',
      column: 'proposal',
      value: 4535,
      weighted: 2267.5,
      overdue: true,
      days_in_stage: 15,
      owner_user_id: 'u-sara',
      owner_label: 'Sara',
      division: '01',
      link: '/crm?edit=c1',
    })
    const sales = rows.get('sales:s1')!
    // First year: 2000 setup + 12 x 1000, weighted at the MRR forecast's 50% for quote sent.
    expect(sales).toMatchObject({ value: 14000, weighted: 7000, stageLabel: 'Quote sent', days_in_stage: 5, source: 'Referral', division: '03' })
    expect(sales.overdue).toBe(false)
    const ctrm = rows.get('ctrm:d1')!
    expect(ctrm).toMatchObject({ value: 40000, weighted: 30000, column: 'deciding', days_in_stage: 10, owner_user_id: null, division: '' })
  })

  it('leaves CTRM commission off the rows for roles that may not see it', () => {
    const rows = byKey(buildDealRows(input({ canSeeCommission: false })))
    expect(rows.get('ctrm:d1')).toMatchObject({ value: null, weighted: null })
    expect(JSON.stringify([...rows.values()])).not.toContain('40000')
  })

  it('values a won CRM deal by its awarded quotes and an unquoted lead as nothing', () => {
    const rows = buildDealRows(
      input({
        crm: [
          { ...input().crm[0], pipeline_stage: 'Won' },
          { ...input().crm[0], id: 'c2', company_name: 'New Lead Co', pipeline_stage: 'Lead', owner: 'Nobody' },
        ],
        quotations: [{ client: 'Mass Allied Freighters', reference_number: 'RR-01-26003', status: 'Awarded', amount: 4535, base_amount: 0, division_code: '01' }],
      }),
    )
    expect(rows.find((r) => r.id === 'c1')).toMatchObject({ open: false, value: 4535, weighted: 4535, column: 'won' })
    expect(rows.find((r) => r.id === 'c2')).toMatchObject({ value: null, weighted: null, owner_user_id: null, owner_label: 'Nobody' })
  })

  it('falls back to older dates for days in stage on rows saved before the stage clock', () => {
    const rows = byKey(
      buildDealRows(input({ crm: [{ ...input().crm[0], stage_changed_at: null }], ctrmStageChanges: [] })),
    )
    expect(rows.get('crm:c1')!.days_in_stage).toBe(10)
    expect(rows.get('ctrm:d1')!.days_in_stage).toBe(80)
  })
})

describe('filters and totals', () => {
  const rows = buildDealRows(input())

  it('filters by owner, pipeline, source and division', () => {
    expect(filterDeals(rows, { ...all, owner: 'u-alfred' }).map((r) => r.key)).toEqual(['sales:s1'])
    expect(filterDeals(rows, { ...all, owner: 'none' }).map((r) => r.key)).toEqual(['ctrm:d1'])
    expect(filterDeals(rows, { ...all, pipeline: 'crm' }).map((r) => r.key)).toEqual(['crm:c1'])
    expect(filterDeals(rows, { ...all, source: 'LinkedIn' }).map((r) => r.key)).toEqual(['ctrm:d1'])
    expect(filterDeals(rows, { ...all, division: '03' }).map((r) => r.key)).toEqual(['sales:s1'])
    expect(filterDeals(rows, { ...all, division: 'none' }).map((r) => r.key)).toEqual(['ctrm:d1'])
  })

  it('hides closed deals unless asked', () => {
    const closed = buildDealRows(input({ ctrmDeals: [{ ...input().ctrmDeals[0], stage: 'lost' }] }))
    expect(filterDeals(closed, all).some((r) => r.key === 'ctrm:d1')).toBe(false)
    expect(filterDeals(closed, { ...all, showClosed: true }).some((r) => r.key === 'ctrm:d1')).toBe(true)
  })

  it('sorts overdue first, then by next action date', () => {
    expect(sortDeals(rows).map((r) => r.key)).toEqual(['crm:c1', 'sales:s1', 'ctrm:d1'])
  })

  it('adds up value and weighted value, and lists sources', () => {
    expect(dealTotals(rows)).toEqual({ count: 3, value: 58535, weighted: 39267.5 })
    expect(dealSources(rows)).toEqual(['LinkedIn', 'Referral'])
  })
})

describe('dealAccess per role', () => {
  it('gives admin, manager and sales every pipeline and the commission', () => {
    for (const role of ['admin', 'manager', 'sales'] as const) {
      expect(dealAccess(role)).toEqual({ pipelines: ['crm', 'sales', 'ctrm'], commission: true })
    }
  })
  it('keeps commission from viewers', () => {
    expect(dealAccess('viewer')).toEqual({ pipelines: ['crm', 'sales', 'ctrm'], commission: false })
  })
  it('keeps the old CRM and commission from staff', () => {
    expect(dealAccess('staff')).toEqual({ pipelines: ['sales', 'ctrm'], commission: false })
  })
})
