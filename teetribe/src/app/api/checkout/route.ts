import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const stripeKey = process.env.STRIPE_SECRET_KEY

  if (!stripeKey) {
    const orderId = `MOCK-${Date.now()}`
    const url = new URL('/order/success', req.nextUrl.origin)
    url.searchParams.set('mock', '1')
    url.searchParams.set('order', orderId)
    if (body.email) url.searchParams.set('email', body.email)
    return NextResponse.json({ ok: true, redirect: url.toString(), orderId })
  }

  // Phase 2: real Stripe Checkout Session
  return NextResponse.json({ ok: false, error: 'Stripe integration coming in Phase 2' }, { status: 501 })
}
