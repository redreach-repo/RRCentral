/** HighMast SaaS plan catalog (tenant billing) — first slice. */

export type SaasPlan = {
  key: string
  name: string
  monthlyAed: number
  seatsIncluded: number
  features: string[]
}

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
