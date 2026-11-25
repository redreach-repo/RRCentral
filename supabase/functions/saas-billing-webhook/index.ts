/**
 * Stripe webhook for HighMast SaaS subscriptions (not invoice pay links, not Tee Tribe).
 * Verify JWT OFF. Stripe signature via RR_STRIPE_WEBHOOK_SECRET (same RR Stripe account).
 * Point checkout.session.completed, customer.subscription.*, invoice.payment_failed here
 * (or share the endpoint with stripe-invoice-webhook — this one only acts on source=highmast-saas).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Stripe from "npm:stripe@22"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  saasApplyFromCheckoutSession,
  saasApplyFromSubscription,
  type SaasWebhookApply,
} from "./saasCheckout.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"
import { serviceRoleKey } from "../_shared/supabaseKeys.ts"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

async function upsertSubscription(
  sb: ReturnType<typeof createClient>,
  row: SaasWebhookApply,
) {
  const { data: existing } = await sb
    .from("tenant_subscriptions")
    .select("id")
    .eq("tenant_id", row.tenantId)
    .maybeSingle()
  const patch = {
    plan_key: row.planKey,
    status: row.status,
    seats: row.seats,
    stripe_customer_id: row.stripeCustomerId,
    stripe_subscription_id: row.stripeSubscriptionId,
    current_period_end: row.currentPeriodEnd,
    updated_at: new Date().toISOString(),
  }
  if (existing?.id) {
    const { error } = await sb.from("tenant_subscriptions").update(patch).eq("id", existing.id)
    if (error) throw error
    return
  }
  const { error } = await sb.from("tenant_subscriptions").insert({
    tenant_id: row.tenantId,
    ...patch,
  })
  if (error) throw error
}

Deno.serve(withErrorLog("saas-billing-webhook", async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const webhookSecret = Deno.env.get("RR_STRIPE_WEBHOOK_SECRET") || ""
  const stripeKey = Deno.env.get("RR_STRIPE_SECRET_KEY") || ""
  if (!webhookSecret || !stripeKey) {
    return json({ error: "RR_STRIPE_WEBHOOK_SECRET or RR_STRIPE_SECRET_KEY is not set" }, 500)
  }
  const signature = req.headers.get("stripe-signature") || ""
  if (!signature) return json({ error: "Unauthorized" }, 401)

  const raw = await req.text()
  const stripe = new Stripe(stripeKey, { apiVersion: "2026-07-29.dahlia" as Stripe.LatestApiVersion })
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider())
  } catch {
    return json({ error: "Unauthorized" }, 401)
  }

  const url = Deno.env.get("SUPABASE_URL") || ""
  const key = serviceRoleKey() || ""
  if (!url || !key) return json({ error: "Server misconfigured" }, 500)
  const sb = createClient(url, key, { auth: { persistSession: false } })

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const apply = saasApplyFromCheckoutSession({
      metadata: session.metadata as Record<string, string> | null,
      customer: session.customer,
      subscription: session.subscription,
    })
    if (!apply) return json({ ok: true, ignored: "not highmast-saas checkout" })
    await upsertSubscription(sb, apply)
    return json({ ok: true, status: apply.status })
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.created"
  ) {
    const sub = event.data.object as Stripe.Subscription
    const apply = saasApplyFromSubscription({
      id: sub.id,
      status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
      customer: sub.customer,
      metadata: sub.metadata as Record<string, string> | null,
      current_period_end: (sub as { current_period_end?: number }).current_period_end ?? null,
    })
    if (!apply) return json({ ok: true, ignored: "not highmast-saas subscription" })
    await upsertSubscription(sb, apply)
    return json({ ok: true, status: apply.status })
  }

  if (event.type === "invoice.payment_failed") {
    const inv = event.data.object as Stripe.Invoice
    const subId =
      typeof inv.subscription === "string"
        ? inv.subscription
        : (inv.subscription as { id?: string } | null)?.id || ""
    if (!subId) return json({ ok: true, ignored: "no subscription on invoice" })
    const { data: row } = await sb
      .from("tenant_subscriptions")
      .select("id, status")
      .eq("stripe_subscription_id", subId)
      .maybeSingle()
    if (!row) return json({ ok: true, ignored: "subscription not tracked" })
    await sb
      .from("tenant_subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("id", row.id)
    return json({ ok: true, status: "past_due" })
  }

  return json({ ok: true, ignored: event.type })
}, { secrets: ["RR_STRIPE_SECRET_KEY", "RR_STRIPE_WEBHOOK_SECRET"] }))
