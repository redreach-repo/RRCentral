import { describe, expect, it } from 'vitest'
import { DEFAULT_DELIVERY_RATES } from './delivery'
import { capacityFromSettings, contractRunsIn, lastMonths, profitTrends, utilisation } from './insights'
import type { Contract, DeliveryPackage } from './types'

const today = new Date(2026, 9, 23) // 23 Oct 2026

function hours(date: string, h: number, extra: Partial<{ account_id: string; category: 'build' | 'support'; user_email: string }> = {}) {
  return { account_id: 'a1', date, hours: h, category: 'support' as const, user_email: 'alfred@redreach.ae', ...extra }
}

function contract(partial: Partial<Contract>): Contract {
  return {
    id: 'c1',
    account_id: 'a1',
    package_id: 'p1',
    option: 'A',
    monthly_fee: 4500,
    setup_fee: 0,
    setup_fee_paid: 0,
    term_start: '2026-06-01',
    term_end: '2027-05-31',
    discount_percent: 0,
    discount_months_left: 0,
    annual_prepay: false,
    status: 'active',
    notes: '',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    auto_invoice: false,
    billing_from: null,
    ...partial,
  } as Contract
}

const pkg = { id: 'p1', tool_cost_aed: 100, included_whatsapp: 4000, ai_cap_usd: null, included_lead_credits_usd: null } as DeliveryPackage

describe('utilisation', () => {
  it('reads capacity from settings with 100 as the default', () => {
    expect(capacityFromSettings({})).toBe(100)
    expect(capacityFromSettings({ deliveryMonthlyCapacityHours: '120' })).toBe(120)
    expect(capacityFromSettings({ deliveryMonthlyCapacityHours: 'x' })).toBe(100)
  })

  it('lists months oldest first ending this month', () => {
    expect(lastMonths(3, today)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('signals hire from the last three full months, ignoring this month', () => {
    const u = utilisation({
      capacity: 100,
      today,
      entries: [hours('2026-07-10', 90), hours('2026-08-10', 88), hours('2026-09-10', 95), hours('2026-10-02', 5)],
    })
    expect(u.recentPercent).toBe(91)
    expect(u.signal).toBe('hire')
    expect(u.months.at(-1)).toMatchObject({ hours: 5, percent: 5 })
  })

  it('watches from 70% and splits this month by person, client and kind', () => {
    const u = utilisation({
      capacity: 100,
      today,
      entries: [
        hours('2026-07-10', 70),
        hours('2026-08-10', 75),
        hours('2026-09-10', 72),
        hours('2026-10-02', 3, { category: 'build', user_email: 'va@redreach.ae', account_id: 'a2' }),
        hours('2026-10-03', 2),
      ],
    })
    expect(u.signal).toBe('watch')
    expect(u.people).toEqual([
      { email: 'va@redreach.ae', hours: 3 },
      { email: 'alfred@redreach.ae', hours: 2 },
    ])
    expect(u.clients[0]).toEqual({ accountId: 'a2', hours: 3 })
    expect(u.months.at(-1)?.byCategory.build).toBe(3)
  })
})

describe('profit trends', () => {
  it('counts a contract only in the months it runs', () => {
    const c = contract({})
    expect(contractRunsIn(c, '2026-05-01')).toBe(false)
    expect(contractRunsIn(c, '2026-06-01')).toBe(true)
    expect(contractRunsIn(c, '2027-06-01')).toBe(false)
    expect(contractRunsIn(contract({ status: 'draft' }), '2026-07-01')).toBe(false)
  })

  it('works out margin per month and flags a falling one', () => {
    const [t] = profitTrends({
      accounts: [{ id: 'a1', name: 'Clinic', type: 'ai_crm_client' }],
      contracts: [contract({})],
      packages: [pkg],
      usage: [],
      entries: [hours('2026-07-10', 10), hours('2026-08-10', 10), hours('2026-09-10', 25)],
      assist: [],
      rates: DEFAULT_DELIVERY_RATES,
      today,
    })
    const sep = t.months.find((m) => m.month === '2026-09-01')!
    // 4500 fee, cost 100 tools + 25h x 150
    expect(sep).toMatchObject({ running: true, revenueAed: 4500, costAed: 3850, marginAed: 650 })
    expect(t.months.find((m) => m.month === '2026-05-01')?.running).toBe(false)
    expect(t.direction).toBe('down')
    expect(t.changePoints).toBeLessThan(-5)
  })

  it('skips accounts that are not AI CRM clients or have no contract', () => {
    const list = profitTrends({
      accounts: [
        { id: 'a1', name: 'Church', type: 'worship_church' },
        { id: 'a2', name: 'Prospect', type: 'ai_crm_client' },
      ],
      contracts: [contract({ account_id: 'a1' })],
      packages: [pkg],
      usage: [],
      entries: [],
      assist: [],
      rates: DEFAULT_DELIVERY_RATES,
      today,
    })
    expect(list).toEqual([])
  })
})
