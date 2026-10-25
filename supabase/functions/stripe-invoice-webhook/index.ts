// Stripe webhook for RR Central invoices (not the Tee Tribe shop's webhook).
// Deploy with Verify JWT OFF: Stripe's signature, checked with
// RR_STRIPE_WEBHOOK_SECRET, is the only key. In Stripe, send
// checkout.session.completed and checkout.session.async_payment_succeeded to
// https://<project>.supabase.co/functions/v1/stripe-invoice-webhook
//
// A paid checkout from an invoice payment link writes payment_log (with the
// currency), marks the invoice Paid or Partial, updates income and clears
// the late invoice reminders. The same event twice changes nothing.
// Rules in app/src/lib/invoicePayLink.ts (bundled).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Stripe from "npm:stripe@22"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { paymentFromSession } from "./invoicePayLink.bundle.js"
import { withErrorLog } from "../_shared/functionHealth.ts"

type PayLinkInvoice = {
  id: string
  reference_number: string
  client: string
  amount: number
  status: string
  payment_status: string
  currency?: string | null
}

type PaidSession = {
  id: string
  payment_status: string
  amount_total: number | null
  currency: string | null
  metadata: Record<string, string> | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

Deno.serve(withErrorLog("stripe-invoice-webhook", async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  // Fail closed: without the signing secret no event is believed.
  const webhookSecret = Deno.env.get("RR_STRIPE_WEBHOOK_SECRET") || ""
  const stripeKey = Deno.env.get("RR_STRIPE_SECRET_KEY") || ""
  if (!webhookSecret || !stripeKey) return json({ error: "RR_STRIPE_WEBHOOK_SECRET or RR_STRIPE_SECRET_KEY is not set" }, 500)
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

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return json({ ok: true, ignored: event.type })
  }
  const session = event.data.object as unknown as PaidSession
  const invoiceId = session.metadata?.invoice_id || ""
  if (!invoiceId || session.metadata?.source !== "rr-central") return json({ ok: true, ignored: "not an RR Central invoice" })

  const url = Deno.env.get("SUPABASE_URL") || ""
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  if (!url || !key) return json({ error: "Server misconfigured" }, 500)
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // Same session twice (Stripe retries): already recorded.
  const { data: seen } = await sb.from("payment_log").select("id").eq("external_ref", session.id).maybeSingle()
  if (seen) return json({ ok: true, duplicate: true })

  const { data: invRow } = await sb
    .from("invoices")
    .select("id, reference_number, client, vertical, amount, status, payment_status, currency, pay_link_id")
    .eq("id", invoiceId)
    .maybeSingle()
  if (!invRow) return json({ ok: true, ignored: "invoice not found" })
  const inv = invRow as PayLinkInvoice & { vertical: string; pay_link_id: string }
  const { data: pays } = await sb.from("payment_log").select("amount").eq("invoice_ref", inv.reference_number)
  const paid = ((pays || []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount || 0), 0)
  const payment = paymentFromSession(session, inv, paid)
  // Not paid yet (a bank debit still clearing): the async success event comes later.
  if (!payment) return json({ ok: true, pending: true })

  const now = new Date().toISOString()
  const { error: logError } = await sb.from("payment_log").insert({
    invoice_ref: inv.reference_number,
    client: inv.client,
    amount: payment.amount,
    currency: payment.currency,
    method: "Card (Stripe)",
    notes: `Paid online through the payment link (${session.id})`,
    user_email: "stripe",
    balance_after: payment.balanceAfter,
    external_ref: session.id,
  })
  if (logError) {
    // The unique index caught a retry racing this one.
    if (logError.code === "23505") return json({ ok: true, duplicate: true })
    throw new Error(`Could not record the payment: ${logError.message}`)
  }
  await sb
    .from("invoices")
    .update({ payment_status: payment.paymentStatus, updated_by: "stripe", updated_at: now, pay_link_url: "", pay_link_amount: null })
    .eq("id", inv.id)
  await sb
    .from("income")
    .update({ payment_status: payment.paymentStatus, status: payment.paymentStatus === "Paid" ? "Paid" : "Open", payment_method: "Card (Stripe)" })
    .eq("reference_number", inv.reference_number)
  if (payment.paymentStatus === "Paid") {
    await sb.from("watch_items").update({ cleared_at: now }).eq("key", `invoice_overdue:${inv.id}`).is("cleared_at", null)
  }
  if (inv.pay_link_id) await stripe.paymentLinks.update(inv.pay_link_id, { active: false }).catch(() => null)
  await sb.from("activity_log").insert({
    action: "stripe_payment",
    entity: "invoice",
    reference: inv.reference_number,
    details: `${payment.currency} ${payment.amount} by card · ${payment.paymentStatus} · bal ${payment.balanceAfter}`,
    user_email: "stripe",
  })
  return json({ ok: true, status: payment.paymentStatus })
}, { secrets: ["RR_STRIPE_SECRET_KEY", "RR_STRIPE_WEBHOOK_SECRET"] }))
