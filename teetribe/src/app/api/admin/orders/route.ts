import { NextResponse } from 'next/server'
import { mockOrders } from '@/data/seed'
import { createAdminClient } from '@/lib/supabase/admin'
import { useMockData } from '@/lib/mock'

export async function GET() {
  if (useMockData()) {
    return NextResponse.json({
      orders: mockOrders.map((o) => ({
        id: o.id,
        email: o.email,
        name: o.email.split('@')[0],
        totalFils: o.totalFils,
        status: o.status,
        createdAt: o.createdAt,
      })),
      mockMode: true,
    })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ orders: [], mockMode: true })
  }

  const { data, error } = await admin
    .from('orders')
    .select('id, email, name, total_fils, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orders = (data || []).map((o) => ({
    id: o.id,
    email: o.email,
    name: o.name,
    totalFils: o.total_fils,
    status: o.status,
    createdAt: new Date(o.created_at).toLocaleDateString('en-AE'),
  }))

  return NextResponse.json({ orders, mockMode: false })
}
