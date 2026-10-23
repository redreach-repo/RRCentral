import { describe, expect, it } from 'vitest'
import { monthCosts } from './attention'
import { DEFAULT_DELIVERY_RATES } from './delivery'
import type { Contract, DeliveryPackage, UsageRecord } from './types'

const pkg = { id: 'growth', included_whatsapp: 4000, tool_cost_aed: 400, ai_cap_usd: null, included_lead_credits_usd: null } as DeliveryPackage
const contract = {
  id: 'c1',
  account_id: 'client',
  package_id: 'growth',
  status: 'active',
  monthly_fee: 4500,
  discount_percent: 0,
  discount_months_left: 0,
  term_start: '2026-01-01',
  term_end: '2026-12-31',
} as Contract

describe('monthCosts', () => {
  const now = new Date(2026, 9, 23)
  const base = {
    now,
    contracts: [contract],
    packages: [pkg],
    usage: [] as UsageRecord[],
    entries: [
      { account_id: 'client', date: '2026-10-05', hours: 10 },
      { account_id: 'client', date: '2026-09-05', hours: 99 },
      { account_id: 'church', date: '2026-10-06', hours: 2 },
    ],
    invoices: [
      { account_id: 'church', date: '2026-10-10', amount: 1050, status: 'Sent' },
      { account_id: 'church', date: '2026-10-11', amount: 525, status: 'Cancelled' },
      { account_id: 'church', date: '2026-09-10', amount: 1050, status: 'Sent' },
      { account_id: 'other', date: '2026-10-10', amount: 9999, status: 'Sent' },
    ],
    churchAccountIds: new Set(['church']),
    rates: { ...DEFAULT_DELIVERY_RATES, fixedMonthlyCostAed: 2000 },
  }

  it('adds contract fees and church invoices without VAT, against tools, hours and fixed costs', () => {
    const r = monthCosts(base)
    expect(r.aiCrmRevenueAed).toBe(4500)
    expect(r.churchRevenueAed).toBe(1000)
    expect(r.revenueAed).toBe(5500)
    expect(r.toolCostAed).toBe(400)
    expect(r.labourAed).toBe(12 * 150)
    expect(r.fixedCostAed).toBe(2000)
    expect(r.leftAed).toBe(5500 - 400 - 1800 - 2000)
  })

  it('skips contracts that are not running this month', () => {
    const r = monthCosts({ ...base, contracts: [{ ...contract, term_end: '2026-09-30' }] })
    expect(r.aiCrmRevenueAed).toBe(0)
    expect(r.labourAed).toBe(12 * 150)
  })
})
