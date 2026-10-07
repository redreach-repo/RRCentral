import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOrderConfirmation } from '@/lib/email'
import { syncOrderToCrm } from '@/lib/crmSync'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 501 })
  }

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const orderId = session.metadata?.orderId
    const email = session.metadata?.email || session.customer_email

    if (!orderId) {
      console.error('[webhook] Missing orderId in session metadata')
      return NextResponse.json({ received: true })
    }

    const admin = createAdminClient()
    if (!admin) {
      console.log('[webhook] No Supabase — order paid (no persistence):', orderId)
      return NextResponse.json({ received: true })
    }

    // Idempotency: skip if already paid or same event processed
    const { data: existing } = await admin
      .from('orders')
      .select('id, status, stripe_event_id')
      .eq('id', orderId)
      .single()

    if (existing?.status === 'paid' || existing?.stripe_event_id === event.id) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    const paidAt = new Date().toISOString()

    const { error: updateErr } = await admin
      .from('orders')
      .update({
        status: 'paid',
        stripe_event_id: event.id,
        stripe_session_id: session.id,
        paid_at: paidAt,
      })
      .eq('id', orderId)
      .neq('status', 'paid')

    if (updateErr) {
      console.error('[webhook] Order update failed:', updateErr)
      return NextResponse.json({ error: 'Order update failed' }, { status: 500 })
    }

    // Decrement stock atomically
    const { data: items } = await admin
      .from('order_items')
      .select('variant_id, qty, product_name, variant_label, price_fils')
      .eq('order_id', orderId)

    if (items) {
      for (const item of items) {
        const { error: stockErr } = await admin.rpc('tt_decrement_stock', {
          p_variant_id: item.variant_id,
          p_qty: item.qty,
        })
        if (stockErr) {
          console.error('[webhook] Stock decrement failed:', item.variant_id, stockErr)
        }
      }
    }

    const { data: order } = await admin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (order && email) {
      await sendOrderConfirmation({
        orderId,
        email: order.email,
        name: order.name,
        totalFils: order.total_fils,
        items: (items || []).map((i) => ({
          name: i.product_name,
          variant: i.variant_label,
          qty: i.qty,
          priceFils: i.price_fils,
        })),
      })

      await syncOrderToCrm({
        orderId,
        email: order.email,
        name: order.name,
        phone: order.phone,
        emirate: order.emirate,
        address: order.address,
        totalFils: order.total_fils,
        subtotalFils: order.subtotal_fils,
        deliveryFils: order.delivery_fils,
        items: (items || []).map((i) => ({
          productName: i.product_name,
          variantLabel: i.variant_label,
          qty: i.qty,
          priceFils: i.price_fils,
        })),
        paidAt,
      })
    }
  }

  return NextResponse.json({ received: true })
}
