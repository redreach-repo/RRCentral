import { describe, expect, it } from 'vitest'
import { contractInterval, contractMrr, mrrForecast, mrrHistory } from './mrr'
import type { Contract } from './types'

const today = new Date('2026-11-15T10:00:00Z')

function c(over: Partial<Contract>): Contract {
  return {
    id: crypto.randomUUID(),
    account_id: 'a',
    package_id: null,
    option: 'A',
    monthly_fee: 1000,
    setup_fee: 0,
    setup_fee_paid: 0,
    term_start: '2026-01-01',
    term_end: '2026-12-31',
    discount_percent: 0,
    discount_months_left: 0,
    annual_prepay: false,
    status: 'active',
    notes: '',
    billing_from: null,
    created_at: '2025-12-20T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('contract revenue dates', () => {
  it('runs from billing start or term start; active ones keep running after the term', () => {
    expect(contractInterval(c({}))).toEqual({ start: '2026-01-01', end: null })
    expect(contractInterval(c({ billing_from: '2026-03-01' }))?.start).toBe('2026-03-01')
    expect(contractInterval(c({ status: 'draft' }))).toBeNull()
  })

  it('ended or cancelled ones stop at the term end or when closed, whichever is first', () => {
    expect(contractInterval(c({ status: 'cancelled', updated_at: '2026-06-10T08:00:00Z' }))?.end).toBe('2026-06-10')
    expect(contractInterval(c({ status: 'ended', updated_at: '2027-01-05T08:00:00Z' }))?.end).toBe('2026-12-31')
  })

  it('counts a month only when the contract runs to its end, with discounts dropping off ahead', () => {
    const k = c({ status: 'cancelled', updated_at: '2026-06-10T08:00:00Z' })
    expect(contractMrr(k, '2026-05-01')).toBe(1000)
    expect(contractMrr(k, '2026-06-01')).toBe(0)
    expect(contractMrr(c({ term_start: '2026-12-01' }), '2026-11-01')).toBe(0)
    const d = c({ discount_percent: 20, discount_months_left: 2 })
    expect(contractMrr(d, '2026-11-01')).toBe(800)
    expect(contractMrr(d, '2026-12-01', 1)).toBe(800)
    expect(contractMrr(d, '2027-01-01', 2)).toBe(1000)
  })
})

describe('MRR history', () => {
  it('shows new, lost, expansion and contraction per month', () => {
    const contracts = [
      c({ account_id: 'a', term_start: '2026-08-01' }),
      c({ account_id: 'b', term_start: '2026-10-01', monthly_fee: 2000 }),
      c({ account_id: 'c', term_start: '2026-06-01', status: 'cancelled', updated_at: '2026-10-20T00:00:00Z', monthly_fee: 500 }),
      // Client d moved to a dearer package in November.
      c({ account_id: 'd', term_start: '2026-01-01', status: 'ended', term_end: '2026-10-31', updated_at: '2026-11-01T00:00:00Z', monthly_fee: 1500 }),
      c({ account_id: 'd', term_start: '2026-11-01', monthly_fee: 2500 }),
    ]
    const h = mrrHistory(contracts, 3, today)
    expect(h.map((m) => m.month)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01'])
    const [sep, oct, nov] = h
    expect(sep.mrr).toBe(3000)
    expect(sep.clients).toBe(3)
    expect(oct).toMatchObject({ mrr: 4500, added: 2000, lost: 500, newClients: ['b'], lostClients: ['c'] })
    expect(nov).toMatchObject({ mrr: 5500, clients: 3, expansion: 1000, added: 0, lost: 0 })
  })
})

describe('MRR forecast', () => {
  it('counts contracts and signed starts, weights open deals, and flags renewals', () => {
    const contracts = [
      c({ account_id: 'a', discount_percent: 50, discount_months_left: 2 }),
      c({ account_id: 'b', term_start: '2027-01-01', term_end: '2027-12-31', monthly_fee: 2000 }),
    ]
    const deals = [
      { stage: 'quote_sent' as const, monthly_fee: 4000, start_date: null, contract_id: null },
      { stage: 'lead' as const, monthly_fee: 1000, start_date: '2027-02-01', contract_id: null },
      { stage: 'signed' as const, monthly_fee: 9999, start_date: null, contract_id: 'x' },
      { stage: 'lost' as const, monthly_fee: 9999, start_date: null, contract_id: null },
    ]
    const f = mrrForecast(contracts, deals, 3, today)
    expect(f.map((m) => m.label)).toEqual(['Dec 2026', 'Jan 2027', 'Feb 2027'])
    expect(f[0]).toMatchObject({ contracted: 500, renewalsDue: 1, pipeline: 2000, total: 2500 })
    expect(f[1]).toMatchObject({ contracted: 3000, renewalsDue: 0, pipeline: 2000 })
    expect(f[2]).toMatchObject({ contracted: 3000, pipeline: 2100, total: 5100 })
  })
})
