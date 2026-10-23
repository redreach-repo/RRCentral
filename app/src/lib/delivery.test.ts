import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DELIVERY_RATES,
  HOURS_ALERT_MESSAGE,
  buildProgress,
  calculateOverage,
  earlyExitFee,
  effectiveMonthlyFee,
  hoursAlert,
  packageFees,
  profitability,
  ratesFromSettings,
  renewalFlag,
  requirementsSignedOff,
  termEndFromStart,
} from './delivery'

const growth = {
  monthly_fee_a: 4500,
  setup_fee_b: 3000,
  monthly_fee_b: 4200,
  included_whatsapp: 4000,
  ai_cap_usd: 50,
  included_lead_credits_usd: 0,
  tool_cost_aed: 300,
}

const usage = (m: number, s: number, ai = 0, leads = 0) => ({
  whatsapp_marketing_count: m,
  whatsapp_service_count: s,
  ai_cost_usd: ai,
  lead_credits_cost_usd: leads,
})

describe('overage calculator', () => {
  it('charges nothing inside the plan', () => {
    const r = calculateOverage(usage(1000, 2500, 40), growth)
    expect(r.usedWhatsapp).toBe(3500)
    expect(r.totalAed).toBe(0)
  })

  it('covers marketing first, then bills service above the pool at AED 0.07', () => {
    // 3,000 marketing + 1,500 service = 4,500, 500 over the 4,000 pool.
    const r = calculateOverage(usage(3000, 1500), growth)
    expect(r.marketingOver).toBe(0)
    expect(r.serviceOver).toBe(500)
    expect(r.serviceAed).toBe(35)
    expect(r.totalAed).toBe(35)
  })

  it('bills marketing above the pool at AED 0.30 and all service once the pool is gone', () => {
    const r = calculateOverage(usage(4200, 300), growth)
    expect(r.marketingOver).toBe(200)
    expect(r.marketingAed).toBe(60)
    expect(r.serviceOver).toBe(300)
    expect(r.serviceAed).toBe(21)
    expect(r.totalAed).toBe(81)
  })

  it('bills AI above the cap at cost plus 25% and lead credits at cost plus 30%, in AED', () => {
    const r = calculateOverage(usage(0, 0, 70, 10), growth)
    expect(r.aiOverUsd).toBe(20)
    // 20 USD x 3.6725 x 1.25
    expect(r.aiAed).toBe(91.81)
    // 10 USD x 3.6725 x 1.30
    expect(r.leadAed).toBe(47.74)
    expect(r.totalAed).toBe(139.55)
  })

  it('does not bill AI when the package has no cap set, and says so', () => {
    const r = calculateOverage(usage(0, 0, 70), { ...growth, ai_cap_usd: null })
    expect(r.aiAed).toBe(0)
    expect(r.notes).toHaveLength(1)
  })

  it('uses the rates from config', () => {
    const rates = ratesFromSettings({ deliveryMarketingRateAed: '0.5', deliveryServiceRateAed: 'oops' })
    expect(rates.marketingRateAed).toBe(0.5)
    expect(rates.serviceRateAed).toBe(DEFAULT_DELIVERY_RATES.serviceRateAed)
    expect(calculateOverage(usage(4100, 0), growth, rates).marketingAed).toBe(50)
  })
})

describe('hours alert', () => {
  const today = new Date('2026-10-15T10:00:00')
  const entry = (date: string, hours: number) => ({ date, hours })

  it('flags two months in a row more than 25% over target', () => {
    // Growth target 14h, threshold 17.5h.
    const entries = [entry('2026-09-03', 18), entry('2026-08-10', 10), entry('2026-08-20', 9)]
    const r = hoursAlert(entries, 14, today)
    expect(r.threshold).toBe(17.5)
    expect(r.flagged).toBe(true)
    expect(r.message).toBe(HOURS_ALERT_MESSAGE)
  })

  it('counts the current month with last month', () => {
    const r = hoursAlert([entry('2026-10-02', 20), entry('2026-09-15', 19)], 14, today)
    expect(r.flagged).toBe(true)
  })

  it('does not flag a single month, or hours exactly at 25% over', () => {
    expect(hoursAlert([entry('2026-09-15', 30), entry('2026-08-15', 10)], 14, today).flagged).toBe(false)
    expect(hoursAlert([entry('2026-09-15', 17.5), entry('2026-08-15', 17.5)], 14, today).flagged).toBe(false)
  })

  it('does not flag months that are not back to back', () => {
    const r = hoursAlert([entry('2026-10-01', 30), entry('2026-08-15', 30)], 14, today)
    expect(r.flagged).toBe(false)
  })

  it('never flags when there is no target', () => {
    expect(hoursAlert([entry('2026-10-01', 30), entry('2026-09-01', 30)], 0, today).flagged).toBe(false)
  })
})

describe('renewal flag', () => {
  const today = new Date('2026-10-15T10:00:00')

  it('shows 60 days before term end', () => {
    expect(renewalFlag({ term_end: '2026-12-14', status: 'active' }, today)).toEqual({
      kind: 'due',
      days: 60,
      termEnd: '2026-12-14',
    })
    expect(renewalFlag({ term_end: '2026-12-15', status: 'active' }, today)).toBeNull()
  })

  it('marks an ended term and ignores contracts that are not active', () => {
    expect(renewalFlag({ term_end: '2026-10-01', status: 'active' }, today)?.kind).toBe('ended')
    expect(renewalFlag({ term_end: '2026-11-01', status: 'ended' }, today)).toBeNull()
    expect(renewalFlag({ term_end: null, status: 'active' }, today)).toBeNull()
  })
})

describe('contract money', () => {
  it('sets a 12 month term', () => {
    expect(termEndFromStart('2026-11-01')).toBe('2027-10-31')
  })

  it('picks option A or B fees from the package', () => {
    expect(packageFees(growth, 'A')).toEqual({ monthly_fee: 4500, setup_fee: 0 })
    expect(packageFees(growth, 'B')).toEqual({ monthly_fee: 4200, setup_fee: 3000 })
  })

  it('applies a discount only while months are left', () => {
    expect(effectiveMonthlyFee({ monthly_fee: 4500, discount_percent: 10, discount_months_left: 2 })).toBe(4050)
    expect(effectiveMonthlyFee({ monthly_fee: 4500, discount_percent: 10, discount_months_left: 0 })).toBe(4500)
  })

  it('works out the early exit fee', () => {
    expect(earlyExitFee({ setup_fee: 3000, setup_fee_paid: 1000, monthly_fee: 4200 })).toBe(10400)
    expect(earlyExitFee({ setup_fee: 0, setup_fee_paid: 0, monthly_fee: 4500 })).toBe(9000)
  })

  it('works out margin with hours at the internal rate', () => {
    const p = profitability({
      contract: { monthly_fee: 4500, discount_percent: 0, discount_months_left: 0 },
      pkg: { tool_cost_aed: 300 },
      usage: { ai_cost_usd: 20, lead_credits_cost_usd: 0 },
      overageAed: 35,
      hours: 14,
      rates: DEFAULT_DELIVERY_RATES,
    })
    expect(p.revenueAed).toBe(4535)
    expect(p.toolCostAed).toBe(373.45)
    expect(p.labourAed).toBe(2100)
    expect(p.marginAed).toBe(2061.55)
    expect(p.marginPercent).toBe(45.5)
  })

  it('counts AI help used in RR Central as tool cost', () => {
    const base = {
      contract: { monthly_fee: 4500, discount_percent: 0, discount_months_left: 0 },
      pkg: { tool_cost_aed: 300 },
      usage: { ai_cost_usd: 20, lead_credits_cost_usd: 0 },
      overageAed: 0,
      hours: 0,
      rates: DEFAULT_DELIVERY_RATES,
    }
    const without = profitability(base)
    const withAssist = profitability({ ...base, assistUsd: 10 })
    expect(withAssist.toolCostAed).toBeCloseTo(without.toolCostAed + 10 * DEFAULT_DELIVERY_RATES.usdToAed, 2)
  })
})

describe('build progress', () => {
  it('counts done stages and names the next one', () => {
    const stages = [
      { stage: 'discovery' as const, status: 'done' as const },
      { stage: 'requirements_signed_off' as const, status: 'done' as const },
      { stage: 'build' as const, status: 'in_progress' as const },
    ]
    expect(buildProgress(stages)).toEqual({ done: 2, total: 6, percent: 33, current: 'Build' })
    expect(requirementsSignedOff(stages)).toBe(true)
    expect(requirementsSignedOff(stages.slice(0, 1))).toBe(false)
  })
})
