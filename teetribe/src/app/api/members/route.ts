import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { useMockData } from '@/lib/mock'
import { sendMemberWelcome } from '@/lib/email'

const schema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
})

function generateDiscountCode(): string {
  return `TRIBE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Email required' }, { status: 400 })
  }

  const { email, name } = parsed.data
  let discountCode = generateDiscountCode()
  let stripeCouponId: string | null = null

  const stripe = getStripe()
  if (stripe) {
    try {
      const coupon = await stripe.coupons.create({
        percent_off: 10,
        duration: 'once',
        name: `tribe-first-${discountCode}`,
        metadata: { email, source: 'teetribe-member' },
      })
      stripeCouponId = coupon.id
    } catch (err) {
      console.error('[members] Stripe coupon creation failed:', err)
    }
  }

  if (useMockData()) {
    await sendMemberWelcome({ email, name, discountCode })
    return NextResponse.json({ ok: true, code: discountCode })
  }

  const admin = createAdminClient()
  if (!admin) {
    await sendMemberWelcome({ email, name, discountCode })
    return NextResponse.json({ ok: true, code: discountCode })
  }

  // Check existing member
  const { data: existing } = await admin.from('members').select('discount_code').eq('email', email).single()
  if (existing) {
    return NextResponse.json({ ok: true, code: existing.discount_code, existing: true })
  }

  discountCode = generateDiscountCode()

  const { data: member, error: memberErr } = await admin
    .from('members')
    .insert({
      email,
      name,
      discount_code: discountCode,
      stripe_coupon_id: stripeCouponId,
    })
    .select('id')
    .single()

  if (memberErr) {
    console.error('[members]', memberErr)
    return NextResponse.json({ ok: false, error: 'Signup failed' }, { status: 500 })
  }

  await admin.from('discount_codes').insert({
    code: discountCode,
    description: 'Tribe member first-order 10% off',
    percent_off: 10,
    stripe_coupon_id: stripeCouponId,
    member_id: member?.id,
    is_active: true,
  })

  await sendMemberWelcome({ email, name, discountCode })

  return NextResponse.json({ ok: true, code: discountCode })
}
