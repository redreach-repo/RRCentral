import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProduct } from '@/lib/catalog'
import { deliveryFeeFils } from '@/lib/money'
import { getStripe, integrationIdentifier, isStripeConfigured } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMockMode } from '@/lib/mock'

const cartLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(20),
})

const checkoutSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(8),
  emirate: z.string().min(1),
  address: z.string().min(5),
  lines: z.array(cartLineSchema).min(1),
  discountCode: z.string().optional(),
})

function generateOrderId(): string {
  return `TT-${Date.now().toString(36).toUpperCase()}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = checkoutSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid checkout data', details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, email, phone, emirate, address, lines } = parsed.data
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin

  // Validate cart against catalogue
  const validatedLines: Array<{
    productId: string
    variantId: string
    qty: number
    productName: string
    variantLabel: string
    priceFils: number
    unitAmount: number
  }> = []

  for (const line of lines) {
    const product = await getProduct(line.productId)
    if (!product) {
      return NextResponse.json({ ok: false, error: `Product not found: ${line.productId}` }, { status: 400 })
    }
    const variant = product.variants.find((v) => v.id === line.variantId)
    if (!variant) {
      return NextResponse.json({ ok: false, error: `Variant not found: ${line.variantId}` }, { status: 400 })
    }
    if (variant.stock < line.qty) {
      return NextResponse.json({ ok: false, error: `Insufficient stock for ${product.name} (${variant.size}/${variant.color})` }, { status: 400 })
    }
    validatedLines.push({
      productId: product.id,
      variantId: variant.id,
      qty: line.qty,
      productName: product.name,
      variantLabel: `${variant.size} / ${variant.color}`,
      priceFils: product.priceFils,
      unitAmount: product.priceFils,
    })
  }

  const subtotalFils = validatedLines.reduce((sum, l) => sum + l.priceFils * l.qty, 0)
  const deliveryFils = deliveryFeeFils(subtotalFils)
  const totalFils = subtotalFils + deliveryFils
  const orderId = generateOrderId()

  // Mock checkout when Stripe not configured
  if (!isStripeConfigured()) {
    const url = new URL('/order/success', siteUrl)
    url.searchParams.set('mock', '1')
    url.searchParams.set('order', orderId)
    url.searchParams.set('email', email)
    return NextResponse.json({ ok: true, redirect: url.toString(), orderId })
  }

  const admin = createAdminClient()

  // Persist pending order when Supabase available
  if (admin && !isMockMode()) {
    await admin.from('customers').upsert({ email, name, phone }, { onConflict: 'email' })

    const { error: orderErr } = await admin.from('orders').insert({
      id: orderId,
      email,
      name,
      phone,
      emirate,
      address,
      subtotal_fils: subtotalFils,
      delivery_fils: deliveryFils,
      total_fils: totalFils,
      status: 'pending',
    })
    if (orderErr) {
      console.error('[checkout] Order insert failed:', orderErr)
      return NextResponse.json({ ok: false, error: 'Failed to create order' }, { status: 500 })
    }

    const orderItems = validatedLines.map((l) => ({
      order_id: orderId,
      product_id: l.productId,
      variant_id: l.variantId,
      product_name: l.productName,
      variant_label: l.variantLabel,
      qty: l.qty,
      price_fils: l.priceFils,
    }))
    await admin.from('order_items').insert(orderItems)
  }

  const stripe = getStripe()!
  const integrationId = integrationIdentifier()

  const lineItems = validatedLines.map((l) => ({
    price_data: {
      currency: 'aed',
      product_data: {
        name: l.productName,
        description: l.variantLabel,
      },
      unit_amount: l.unitAmount,
    },
    quantity: l.qty,
  }))

  if (deliveryFils > 0) {
    lineItems.push({
      price_data: {
        currency: 'aed',
        product_data: { name: 'UAE Delivery', description: 'Flat rate delivery' },
        unit_amount: deliveryFils,
      },
      quantity: 1,
    })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: 'aed',
      customer_email: email,
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['AE'] },
      phone_number_collection: { enabled: true },
      success_url: `${siteUrl}/order/success?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout?cancelled=1`,
      metadata: {
        orderId,
        email,
        integration_identifier: integrationId,
      },
      payment_intent_data: {
        metadata: { orderId, email, integration_identifier: integrationId },
      },
    })

    if (admin && !isMockMode()) {
      await admin.from('orders').update({ stripe_session_id: session.id }).eq('id', orderId)
    }

    return NextResponse.json({ ok: true, redirect: session.url, orderId, sessionId: session.id })
  } catch (err) {
    console.error('[checkout] Stripe session failed:', err)
    return NextResponse.json({ ok: false, error: 'Payment session failed' }, { status: 500 })
  }
}
