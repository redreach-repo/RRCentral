import { describe, expect, it } from 'vitest'
import { planByKey } from './saasBillingPlans'
import {
  aedToFils,
  buildSaasCheckoutParams,
  mapStripeSubscriptionStatus,
  saasApplyFromCheckoutSession,
  saasApplyFromSubscription,
  saasCheckoutProblem,
  SAAS_CHECKOUT_SOURCE,
  stripeTaxStubEnabled,
} from './saasCheckout'

describe('aedToFils', () => {
  it('converts major units', () => {
    expect(aedToFils(499)).toBe(49900)
    expect(aedToFils(1499.5)).toBe(149950)
  })
})

describe('saasCheckoutProblem', () => {
  it('accepts portal without plan', () => {
    expect(saasCheckoutProblem({ action: 'portal' })).toBeNull()
  })

  it('requires plan and urls for checkout', () => {
    expect(saasCheckoutProblem({ action: 'checkout', plan_key: 'starter' })).toMatch(/success_url/)
    expect(
      saasCheckoutProblem({
        plan_key: 'starter',
        success_url: 'https://example.com/ok',
        cancel_url: 'https://example.com/cancel',
      }),
    ).toBeNull()
  })
})

describe('buildSaasCheckoutParams', () => {
  it('builds a monthly AED subscription line', () => {
    const plan = planByKey('growth')!
    const params = buildSaasCheckoutParams({
      plan,
      tenantId: 'tenant-1',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel',
      stripeCustomerId: 'cus_x',
    })
    expect(params.mode).toBe('subscription')
    expect(params.customer).toBe('cus_x')
    expect(params.metadata.source).toBe(SAAS_CHECKOUT_SOURCE)
    expect(params.line_items[0].price_data.unit_amount).toBe(149900)
    expect(params.line_items[0].price_data.currency).toBe('aed')
    expect(params.automatic_tax).toBeUndefined()
  })

  it('adds tax stub when enabled', () => {
    expect(stripeTaxStubEnabled({})).toBe(false)
    expect(stripeTaxStubEnabled({ STRIPE_TAX_STUB: '1' })).toBe(true)
    const plan = planByKey('starter')!
    const params = buildSaasCheckoutParams({
      plan,
      tenantId: 't',
      successUrl: 'https://a',
      cancelUrl: 'https://b',
      enableTaxStub: true,
    })
    expect(params.automatic_tax).toEqual({ enabled: true })
  })
})

describe('mapStripeSubscriptionStatus', () => {
  it('maps known statuses', () => {
    expect(mapStripeSubscriptionStatus('trialing')).toBe('trialing')
    expect(mapStripeSubscriptionStatus('past_due')).toBe('past_due')
    expect(mapStripeSubscriptionStatus('canceled')).toBe('canceled')
  })
})

describe('saasApplyFromCheckoutSession', () => {
  it('ignores non-saas sessions', () => {
    expect(saasApplyFromCheckoutSession({ metadata: { source: 'rr-central' } })).toBeNull()
  })

  it('extracts tenant and plan', () => {
    const row = saasApplyFromCheckoutSession({
      metadata: { source: SAAS_CHECKOUT_SOURCE, tenant_id: 't1', plan_key: 'starter' },
      customer: 'cus_1',
      subscription: 'sub_1',
    })
    expect(row?.seats).toBe(5)
    expect(row?.stripeSubscriptionId).toBe('sub_1')
  })
})

describe('saasApplyFromSubscription', () => {
  it('applies period end', () => {
    const row = saasApplyFromSubscription({
      id: 'sub_2',
      status: 'active',
      customer: 'cus_2',
      metadata: { source: SAAS_CHECKOUT_SOURCE, tenant_id: 't1', plan_key: 'scale' },
      current_period_end: 1_700_000_000,
    })
    expect(row?.planKey).toBe('scale')
    expect(row?.currentPeriodEnd).toMatch(/^\d{4}-/)
  })
})
