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

export const INTEGRATION_IDENTIFIER = 'tee-tribe-web-kxmqpwrn'

export function integrationIdentifier(): string {
  return INTEGRATION_IDENTIFIER
}
