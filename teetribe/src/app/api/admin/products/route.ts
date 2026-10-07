import { NextRequest, NextResponse } from 'next/server'
import { products as seedProducts } from '@/data/seed'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMockMode } from '@/lib/mock'

export async function GET() {
  const mockMode = isMockMode()

  if (mockMode) {
    const rows = seedProducts.flatMap((p) =>
      p.variants.map((v) => ({
        variantId: v.id,
        productName: p.name,
        size: v.size,
        color: v.color,
        stock: v.stock,
      })),
    )
    return NextResponse.json({ rows, mockMode: true })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ rows: [], mockMode: true })
  }

  const { data, error } = await admin
    .from('tt_product_variants')
    .select('id, size, color, stock, products(name)')
    .order('product_id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []).map((v: {
    id: string
    size: string
    color: string
    stock: number
    products: { name: string } | { name: string }[] | null
  }) => {
    const product = v.products
    const productName = Array.isArray(product) ? product[0]?.name : product?.name
    return {
      variantId: v.id,
      productName: productName ?? 'Unknown',
      size: v.size,
      color: v.color,
      stock: v.stock,
    }
  })

  return NextResponse.json({ rows, mockMode: false })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const variantId = body?.variantId as string
  const stock = Number(body?.stock)

  if (!variantId || Number.isNaN(stock) || stock < 0) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  if (isMockMode()) {
    return NextResponse.json({ ok: true, mock: true })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Not configured' }, { status: 501 })
  }

  const { error } = await admin.from('tt_product_variants').update({ stock }).eq('id', variantId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
