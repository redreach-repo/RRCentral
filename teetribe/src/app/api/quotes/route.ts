import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMockMode } from '@/lib/mock'
import { sendQuoteNotification } from '@/lib/email'

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  productInterest: z.string().optional(),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Name and email required' }, { status: 400 })
  }

  const data = parsed.data
  const quoteId = `Q-${Date.now().toString(36).toUpperCase()}`

  await sendQuoteNotification({
    quoteId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    company: data.company,
    quantity: data.quantity,
    productInterest: data.productInterest,
    notes: data.notes,
  })

  if (isMockMode()) {
    return NextResponse.json({ ok: true, quoteId })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: true, quoteId })
  }

  const { error } = await admin.from('quote_requests').insert({
    id: quoteId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    company: data.company,
    quantity: data.quantity,
    product_interest: data.productInterest,
    notes: data.notes,
    status: 'new',
  })

  if (error) {
    console.error('[quotes]', error)
    return NextResponse.json({ ok: false, error: 'Failed to submit quote' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, quoteId })
}
