import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: '2026-09-30.endive' })
  }
  return stripeClient
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function integrationIdentifier(): string {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `tee-tribe-web-${suffix}`
}
