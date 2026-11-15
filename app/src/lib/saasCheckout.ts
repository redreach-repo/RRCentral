/**
 * HighMast SaaS Checkout helpers (tenant plan billing — not customer invoices).
 * Shared by the app and Edge Functions via build-support-function.mjs.
 */
import { planByKey, type SaasPlan, type SaasSubscriptionStatus } from './saasBillingPlans'

export { planByKey }

export const SAAS_CHECKOUT_SOURCE = 'highmast-saas'

export type SaasCheckoutRequest = {
  plan_key?: unknown
  success_url?: unknown
  cancel_url?: unknown
  action?: unknown
}

export type SaasCheckoutSessionParams = {
  mode: 'subscription'
  success_url: string
  cancel_url: string
  client_reference_id: string
  metadata: {
    source: typeof SAAS_CHECKOUT_SOURCE
    tenant_id: string
    plan_key: string
  }
  subscription_data: {
    metadata: {
      source: typeof SAAS_CHECKOUT_SOURCE
      tenant_id: string
      plan_key: string
    }
  }
  line_items: Array<{
    quantity: 1
    price_data: {
      currency: 'aed'
      unit_amount: number
      recurring: { interval: 'month' }
      product_data: { name: string; metadata: { plan_key: string } }
    }
  }>
  customer?: string
  /** Stub only — live Stripe Tax registration is Not done / Alfred. Default off. */
  automatic_tax?: { enabled: boolean }
}

/** AED major units → fils (Stripe smallest currency unit). */
export function aedToFils(aed: number): number {
  return Math.round(Math.max(0, Number(aed) || 0) * 100)
}

export function saasCheckoutProblem(body: SaasCheckoutRequest): string | null {
  const action = typeof body.action === 'string' ? body.action : 'checkout'
  if (action === 'portal') return null
  if (action !== 'checkout') return 'Unknown action'
  const planKey = typeof body.plan_key === 'string' ? body.plan_key.trim() : ''
  if (!planByKey(planKey)) return 'Pick a HighMast plan'
  if (typeof body.success_url !== 'string' || !/^https?:\/\//i.test(body.success_url)) {
    return 'success_url must be an http(s) URL'
  }
  if (typeof body.cancel_url !== 'string' || !/^https?:\/\//i.test(body.cancel_url)) {
    return 'cancel_url must be an http(s) URL'
  }
  return null
}

export function stripeTaxStubEnabled(env: Record<string, string | undefined> = {}): boolean {
  const v = String(env.STRIPE_TAX_STUB || env.VITE_STRIPE_TAX_STUB || '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function buildSaasCheckoutParams(input: {
  plan: SaasPlan
  tenantId: string
  successUrl: string
  cancelUrl: string
  stripeCustomerId?: string | null
  /** When true, include automatic_tax.enabled (still Unverified / not registered). */
  enableTaxStub?: boolean
}): SaasCheckoutSessionParams {
  const params: SaasCheckoutSessionParams = {
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.tenantId,
    metadata: {
      source: SAAS_CHECKOUT_SOURCE,
      tenant_id: input.tenantId,
      plan_key: input.plan.key,
    },
    subscription_data: {
      metadata: {
        source: SAAS_CHECKOUT_SOURCE,
        tenant_id: input.tenantId,
        plan_key: input.plan.key,
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'aed',
          unit_amount: aedToFils(input.plan.monthlyAed),
          recurring: { interval: 'month' },
          product_data: {
            name: `HighMast ${input.plan.name}`,
            metadata: { plan_key: input.plan.key },
          },
        },
      },
    ],
  }
  if (input.enableTaxStub) {
    params.automatic_tax = { enabled: true }
  }
  if (input.stripeCustomerId) params.customer = input.stripeCustomerId
  return params
}

/** Map Stripe subscription status → our tenant_subscriptions.status. */
export function mapStripeSubscriptionStatus(stripeStatus: string): SaasSubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return 'active'
  }
}

export type SaasWebhookApply = {
  tenantId: string
  planKey: string
  status: SaasSubscriptionStatus
  seats: number
  stripeCustomerId: string
  stripeSubscriptionId: string
  currentPeriodEnd: string | null
}

export function saasApplyFromCheckoutSession(session: {
  metadata?: Record<string, string> | null
  customer?: string | { id?: string } | null
  subscription?: string | { id?: string } | null
}): SaasWebhookApply | null {
  if (session.metadata?.source !== SAAS_CHECKOUT_SOURCE) return null
  const tenantId = session.metadata.tenant_id || ''
  const planKey = session.metadata.plan_key || ''
  const plan = planByKey(planKey)
  if (!tenantId || !plan) return null
  const customer =
    typeof session.customer === 'string' ? session.customer : session.customer?.id || ''
  const subscription =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || ''
  if (!customer || !subscription) return null
  return {
    tenantId,
    planKey,
    status: 'active',
    seats: plan.seatsIncluded,
    stripeCustomerId: customer,
    stripeSubscriptionId: subscription,
    currentPeriodEnd: null,
  }
}

export function saasApplyFromSubscription(sub: {
  id: string
  status: string
  customer?: string | { id?: string } | null
  metadata?: Record<string, string> | null
  current_period_end?: number | null
  items?: { data?: Array<{ price?: { product?: string | { metadata?: Record<string, string> | null } | null } | null }> }
}): SaasWebhookApply | null {
  if (sub.metadata?.source !== SAAS_CHECKOUT_SOURCE) return null
  const tenantId = sub.metadata.tenant_id || ''
  let planKey = sub.metadata.plan_key || ''
  if (!planKey) {
    const product = sub.items?.data?.[0]?.price?.product
    if (product && typeof product !== 'string') {
      planKey = product.metadata?.plan_key || ''
    }
  }
  const plan = planByKey(planKey)
  if (!tenantId || !plan) return null
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || ''
  const periodEnd =
    typeof sub.current_period_end === 'number' && sub.current_period_end > 0
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null
  return {
    tenantId,
    planKey,
    status: mapStripeSubscriptionStatus(sub.status),
    seats: plan.seatsIncluded,
    stripeCustomerId: customer,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: periodEnd,
  }
}

export function randomIntegrationSuffix(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
