/**
 * Pay by card: a Stripe payment link on a finalised invoice, and the webhook
 * that marks it paid. Same Stripe patterns as the Tee Tribe shop, with
 * separate keys (RR_STRIPE_SECRET_KEY, RR_STRIPE_WEBHOOK_SECRET) and webhook.
 * Shared by the app and the invoice-pay-link and stripe-invoice-webhook Edge
 * Functions (bundled). Only pure code here.
 *
 * The link asks for what is still owed, in the invoice's currency, and works
 * once. When Stripe says it is paid the webhook writes payment_log (with the
 * currency), marks the invoice Paid or Partial, updates income and clears the
 * late invoice reminders. Bank transfer stays as the manual option.
 */

/** Currencies Stripe counts in whole units (no cents). */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])

export type PayLinkInvoice = {
  id: string
  reference_number: string
  client: string
  amount: number
  status: string
  payment_status: string
  currency?: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Still owed after the payments so far. */
export function outstanding(amount: number, paidSoFar: number): number {
  return Math.max(0, round2((Number(amount) || 0) - (Number(paidSoFar) || 0)))
}

export function invoiceCurrency(inv: Pick<PayLinkInvoice, 'currency'>): string {
  return String(inv.currency || 'AED').trim().toUpperCase() || 'AED'
}

/** Why an invoice cannot have a payment link, or null when it can. */
export function payLinkProblem(inv: PayLinkInvoice, paidSoFar: number): string | null {
  if (!inv.reference_number) return 'Finalise the invoice first, so it has its RR number'
  const s = String(inv.status || '').toLowerCase()
  if (s === 'draft') return 'Finalise the invoice first, so it has its RR number'
  if (s === 'cancelled') return 'Cancelled invoices cannot take payments'
  if (inv.payment_status === 'Paid') return 'This invoice is already paid'
  const owed = outstanding(inv.amount, paidSoFar)
  if (owed <= 0) return 'Nothing is owed on this invoice'
  if (toMinorUnits(owed, invoiceCurrency(inv)) < 200) return 'The amount owed is too small for a card payment'
  return null
}

/** Stripe amounts are in the smallest unit: fils, cents. */
export function toMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100)
}

export function fromMinorUnits(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? minor : round2(minor / 100)
}

/** The Stripe price and payment link for what is owed. Works once, then closes. */
export function payLinkParams(inv: PayLinkInvoice, owed: number, companyName: string) {
  const currency = invoiceCurrency(inv)
  const metadata = { invoice_id: inv.id, invoice_ref: inv.reference_number, source: 'rr-central' }
  return {
    price: {
      currency: currency.toLowerCase(),
      unit_amount: toMinorUnits(owed, currency),
      product_data: { name: `Invoice ${inv.reference_number} (${companyName})`.slice(0, 250) },
      metadata,
    },
    link: {
      metadata,
      payment_intent_data: { metadata, description: `Invoice ${inv.reference_number}, ${inv.client}`.slice(0, 500) },
      restrictions: { completed_sessions: { limit: 1 } },
      after_completion: { type: 'hosted_confirmation', hosted_confirmation: { custom_message: `Thank you. Your payment for invoice ${inv.reference_number} was received.` } },
    },
  }
}

export type PaidSession = {
  id: string
  payment_status: string
  amount_total: number | null
  currency: string | null
  metadata: Record<string, string> | null
  payment_link?: string | null
}

/**
 * What a completed Stripe checkout means for the invoice. Null when it is
 * not one of ours or not paid yet (bank debits arrive later as async success).
 */
export function paymentFromSession(
  session: PaidSession,
  inv: PayLinkInvoice,
  paidSoFar: number,
): { amount: number; currency: string; balanceAfter: number; paymentStatus: 'Paid' | 'Partial' } | null {
  if (session.payment_status !== 'paid') return null
  if (!session.metadata || session.metadata.invoice_id !== inv.id) return null
  const currency = String(session.currency || invoiceCurrency(inv)).toUpperCase()
  const amount = fromMinorUnits(Number(session.amount_total) || 0, currency)
  if (!(amount > 0)) return null
  const balanceAfter = outstanding(inv.amount, paidSoFar + amount)
  return { amount, currency, balanceAfter, paymentStatus: balanceAfter <= 0.009 ? 'Paid' : 'Partial' }
}

/** Who may make a payment link: the people who work on invoices. */
export function canMakePayLink(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'sales'
}
