import { describe, expect, it } from 'vitest'
import {
  canMakeContract,
  contractFromQuote,
  defaultStartDate,
  hasQuote,
  isSalesDealOverdue,
  pipelineTotals,
  quoteFirstYear,
  quoteFromPackage,
  salesDealProblem,
} from './salesPipeline'
import type { SalesDeal } from './types'

function deal(over: Partial<SalesDeal> = {}): SalesDeal {
  return {
    id: 'd1',
    account_id: 'a1',
    stage: 'lead',
    source: '',
    owner_user_id: null,
    next_action: 'Book the discovery call',
    next_action_date: '2026-10-25',
    lost_reason: '',
    notes: '',
    discovery_call_date: null,
    package_id: null,
    option: 'A',
    monthly_fee: 0,
    setup_fee: 0,
    discount_percent: 0,
    discount_months: 0,
    start_date: null,
    quote_reference: '',
    quote_sent_at: null,
    contract_id: null,
    signed_at: null,
    last_touch_at: '2026-10-20T08:00:00Z',
    created_by: '',
    created_at: '2026-10-20T08:00:00Z',
    updated_at: '2026-10-20T08:00:00Z',
    ...over,
  }
}

const growth = { id: 'p2', monthly_fee_a: 4500, setup_fee_b: 3000, monthly_fee_b: 4200 }
const now = new Date(2026, 9, 23, 10)

describe('deal rules', () => {
  it('needs a next action and date while open', () => {
    expect(salesDealProblem(deal())).toBeNull()
    expect(salesDealProblem(deal({ next_action: ' ' }))).toBe('Every open deal needs a next action')
    expect(salesDealProblem(deal({ next_action_date: null }))).toBe('Give the next action a date')
  })

  it('needs a reason when lost', () => {
    expect(salesDealProblem(deal({ stage: 'lost', next_action: '' }))).toBe('Pick why the deal was lost')
    expect(salesDealProblem(deal({ stage: 'lost', lost_reason_code: 'Competitor won', next_action: '' }))).toBe(
      'Add a note on why the deal was lost',
    )
    expect(salesDealProblem(deal({ stage: 'lost', lost_reason_code: 'Made up', lost_reason: 'x', next_action: '' }))).toBe(
      'Pick why the deal was lost',
    )
    expect(
      salesDealProblem(deal({ stage: 'lost', lost_reason_code: 'Competitor won', lost_reason: 'Went with HubSpot', next_action: '' })),
    ).toBeNull()
  })

  it('needs the quote before Quote sent', () => {
    expect(salesDealProblem(deal({ stage: 'quote_sent' }))).toBe('Pick the package and fees that were quoted')
    expect(salesDealProblem(deal({ stage: 'quote_sent', package_id: 'p2', monthly_fee: 4500 }))).toBeNull()
  })

  it('only signs through Make contract', () => {
    expect(salesDealProblem(deal({ stage: 'signed', package_id: 'p2', monthly_fee: 4500 }))).toMatch(/Make contract/)
    expect(salesDealProblem(deal({ stage: 'signed', contract_id: 'c1', next_action: '' }))).toBeNull()
  })

  it('flags overdue next actions on open deals only', () => {
    expect(isSalesDealOverdue(deal({ next_action_date: '2026-10-22' }), now)).toBe(true)
    expect(isSalesDealOverdue(deal({ next_action_date: '2026-10-23' }), now)).toBe(false)
    expect(isSalesDealOverdue(deal({ stage: 'lost', next_action_date: '2026-10-01' }), now)).toBe(false)
  })
})

describe('quotes', () => {
  it('takes the fees from the package and option', () => {
    expect(quoteFromPackage(growth, 'A')).toEqual({ package_id: 'p2', option: 'A', monthly_fee: 4500, setup_fee: 0 })
    expect(quoteFromPackage(growth, 'B')).toEqual({ package_id: 'p2', option: 'B', monthly_fee: 4200, setup_fee: 3000 })
  })

  it('works out the first year value with discount months', () => {
    expect(quoteFirstYear({ monthly_fee: 4200, setup_fee: 3000, discount_percent: 0, discount_months: 0 })).toBe(53400)
    expect(quoteFirstYear({ monthly_fee: 4500, setup_fee: 0, discount_percent: 20, discount_months: 3 })).toBe(51300)
  })

  it('needs a package and a fee', () => {
    expect(hasQuote(deal())).toBe(false)
    expect(hasQuote(deal({ package_id: 'p2', monthly_fee: 0 }))).toBe(false)
    expect(hasQuote(deal({ package_id: 'p2', monthly_fee: 4500 }))).toBe(true)
  })

  it('totals each stage', () => {
    const totals = pipelineTotals([
      deal({ stage: 'quote_sent', package_id: 'p2', monthly_fee: 4500 }),
      deal({ stage: 'quote_sent', package_id: 'p1', monthly_fee: 1900 }),
      deal({ stage: 'lead' }),
    ])
    expect(totals.find((t) => t.stage === 'quote_sent')).toMatchObject({ count: 2, monthly: 6400 })
    expect(totals.find((t) => t.stage === 'lead')).toMatchObject({ count: 1, monthly: 0 })
  })
})

describe('Make contract', () => {
  const quoted = deal({
    stage: 'quote_sent',
    package_id: 'p2',
    option: 'B',
    monthly_fee: 4200,
    setup_fee: 3000,
    discount_percent: 10,
    discount_months: 2,
    start_date: '2026-11-01',
    quote_reference: 'RR-03-26014',
  })

  it('is offered for open quoted deals without a contract', () => {
    expect(canMakeContract(quoted)).toBe(true)
    expect(canMakeContract({ ...quoted, contract_id: 'c1' })).toBe(false)
    expect(canMakeContract({ ...quoted, stage: 'lost' })).toBe(false)
    expect(canMakeContract(deal())).toBe(false)
  })

  it('turns the quote into a 12 month contract', () => {
    expect(contractFromQuote(quoted, now)).toEqual({
      package_id: 'p2',
      option: 'B',
      monthly_fee: 4200,
      setup_fee: 3000,
      setup_fee_paid: 0,
      term_start: '2026-11-01',
      term_end: '2027-10-31',
      discount_percent: 10,
      discount_months_left: 2,
      annual_prepay: false,
      status: 'active',
      notes: 'Made from quote RR-03-26014 on 23 Oct 2026.',
      auto_invoice: false,
      billing_from: null,
    })
  })

  it('starts on the first of next month when no date was agreed', () => {
    expect(defaultStartDate(now)).toBe('2026-11-01')
    expect(defaultStartDate(new Date(2026, 11, 15))).toBe('2027-01-01')
    expect(contractFromQuote({ ...quoted, start_date: null, quote_reference: '' }, now)).toMatchObject({
      term_start: '2026-11-01',
      notes: 'Made from the pre-sale quote on 23 Oct 2026.',
    })
  })
})
