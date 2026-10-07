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
    .from('members')
    .select('id, email, name, discount_code, used_discount, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    discountCode: r.discount_code,
    usedDiscount: r.used_discount,
    createdAt: new Date(r.created_at).toLocaleDateString('en-AE'),
  }))

  return NextResponse.json({ rows, mockMode: false })
}
