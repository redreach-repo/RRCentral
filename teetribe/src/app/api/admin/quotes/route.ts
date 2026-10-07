import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMockMode } from '@/lib/mock'

export async function GET() {
  if (isMockMode()) {
    return NextResponse.json({ rows: [], mockMode: true })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ rows: [], mockMode: true })
  }

  const { data, error } = await admin
    .from('quote_requests')
    .select('id, name, email, product_interest, quantity, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    productInterest: r.product_interest,
    quantity: r.quantity,
    status: r.status,
    createdAt: new Date(r.created_at).toLocaleDateString('en-AE'),
  }))

  return NextResponse.json({ rows, mockMode: false })
}
