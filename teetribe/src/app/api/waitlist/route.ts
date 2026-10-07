import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMockMode } from '@/lib/mock'

const schema = z.object({
  email: z.string().email(),
  productId: z.string().optional(),
  productSlug: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 })
  }

  const { email, productId, productSlug } = parsed.data

  if (isMockMode()) {
    console.log('[waitlist stub]', email, productSlug)
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await admin.from('drop_waitlist').upsert(
    { email, product_id: productId, product_slug: productSlug || 'general' },
    { onConflict: 'email,product_slug' },
  )

  if (error) {
    console.error('[waitlist]', error)
    return NextResponse.json({ ok: false, error: 'Failed to join waitlist' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
