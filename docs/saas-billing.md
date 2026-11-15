# HighMast SaaS billing (tenant plans)

**Separate from** customer invoice card links (`invoice-pay-link`) and the Tee Tribe shop (`create-checkout-session`).

## Flow

1. Admin opens **SaaS billing**, picks a plan, clicks **Subscribe with Stripe**.
2. Edge Function `saas-checkout` creates a Checkout Session (`mode: subscription`, AED monthly `price_data`).
3. Stripe redirects back to `/saas-billing?checkout=success`.
4. Webhook `saas-billing-webhook` writes `tenant_subscriptions` (`stripe_customer_id`, `stripe_subscription_id`, status, period end).
5. **Manage in Stripe** opens the Customer Portal for payment method / cancel.

Local **Save trial / Activate / Cancel** remain for demos without Stripe.

## Secrets

| Secret | Use |
|--------|-----|
| `RR_STRIPE_SECRET_KEY` | Checkout + portal + webhook |
| `RR_STRIPE_WEBHOOK_SECRET` | Webhook signature (same RR Stripe account as invoices) |

Point Stripe events at `…/functions/v1/saas-billing-webhook`:
`checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`.

Metadata `source=highmast-saas` scopes events away from invoice pay-link handling.

## Tax

Enable Stripe Tax and an active registration before charging live UAE/GCC customers. Checkout will not collect tax until then.
