/** HighMast SaaS plan catalog (tenant billing). */

export type SaasPlan = {
  key: string
  name: string
  monthlyAed: number
  seatsIncluded: number
  features: string[]
}

export type SaasSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export const SAAS_PLANS: SaasPlan[] = [
  {
    key: 'starter',
    name: 'Starter',
    monthlyAed: 499,
    seatsIncluded: 5,
    features: ['CRM', 'Quotes', 'Invoices'],
  },
  {
    key: 'growth',
    name: 'Growth',
    monthlyAed: 1499,
    seatsIncluded: 15,
    features: ['Starter', 'Delivery', 'Approvals'],
  },
  {
    key: 'scale',
    name: 'Scale',
    monthlyAed: 3999,
    seatsIncluded: 50,
    features: ['Growth', 'API', 'Industry packs'],
  },
]

export function planByKey(key: string): SaasPlan | undefined {
  return SAAS_PLANS.find((p) => p.key === key)
}

/** Soft seat check for planning UI (not enforced billing). */
export function seatUsageLabel(used: number, included: number): string {
  const u = Math.max(0, Math.floor(used))
  const i = Math.max(0, Math.floor(included))
  if (i <= 0) return `${u} seats used`
  const pct = Math.min(100, Math.round((u / i) * 100))
  return `${u} / ${i} seats (${pct}%)`
}

export function seatsOverLimit(used: number, included: number): boolean {
  return Math.max(0, Math.floor(used)) > Math.max(0, Math.floor(included))
}

export function nextSubscriptionStatus(
  current: SaasSubscriptionStatus,
  action: 'activate' | 'cancel' | 'mark_past_due' | 'resume_trial',
): SaasSubscriptionStatus | null {
  if (action === 'activate') {
    if (current === 'canceled') return null
    return 'active'
  }
  if (action === 'cancel') {
    if (current === 'canceled') return null
    return 'canceled'
  }
  if (action === 'mark_past_due') {
    if (current !== 'active' && current !== 'trialing') return null
    return 'past_due'
  }
  if (action === 'resume_trial') {
    if (current !== 'canceled' && current !== 'past_due') return null
    return 'trialing'
  }
  return null
}
