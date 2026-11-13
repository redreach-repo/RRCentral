import { describe, expect, it } from 'vitest'
import { parseDeliveryPackageForm, parseDeliveryRatesForm } from './deliverySettings'

const pkg = {
  name: 'Growth',
  support_response: '1 working day',
  monthly_fee_a: '4500',
  setup_fee_b: '5000',
  monthly_fee_b: '4000',
  target_hours: '40',
  build_hours_target: '80',
  included_whatsapp: '500',
  support_response_days: '1',
  ai_cap_usd: '',
  included_lead_credits_usd: '50',
  tool_cost_aed: '200',
  fallbackName: 'Growth',
}

describe('parseDeliveryPackageForm', () => {
  it('rejects a bad fee', () => {
    const r = parseDeliveryPackageForm({ ...pkg, monthly_fee_a: 'abc' })
    expect(r.ok).toBe(false)
  })

  it('allows blank optional AI cap', () => {
    const r = parseDeliveryPackageForm(pkg)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.ai_cap_usd).toBeNull()
  })
})

describe('parseDeliveryRatesForm', () => {
  it('rejects negative rates', () => {
    const r = parseDeliveryRatesForm({
      marketingRateAed: '-1',
      serviceRateAed: '0.2',
      aiMarkupPercent: '20',
      leadMarkupPercent: '20',
      internalHourlyRateAed: '150',
      usdToAed: '3.67',
      fixedMonthlyCostAed: '1000',
    })
    expect(r.ok).toBe(false)
  })

  it('accepts valid rates', () => {
    const r = parseDeliveryRatesForm({
      marketingRateAed: '0.1',
      serviceRateAed: '0.2',
      aiMarkupPercent: '20',
      leadMarkupPercent: '20',
      internalHourlyRateAed: '150',
      usdToAed: '3.67',
      fixedMonthlyCostAed: '1000',
    })
    expect(r.ok).toBe(true)
  })
})
