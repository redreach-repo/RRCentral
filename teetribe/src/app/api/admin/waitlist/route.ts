import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { useMockData } from '@/lib/mock'

export async function GET() {
  if (useMockData()) {
    return NextResponse.json({ rows: [], mockMode: true })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ rows: [], mockMode: true })
  }

  const { data, error } = await admin
    .from('drop_waitlist')
    .select('id, email, product_slug, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []).map((r) => ({
    id: r.id,
    email: r.email,
    productSlug: r.product_slug,
    createdAt: new Date(r.created_at).toLocaleDateString('en-AE'),
  }))

  return NextResponse.json({ rows, mockMode: false })
}
