import { createClient } from '@supabase/supabase-js'
import { collections, products } from '../src/data/seed'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function seed() {
  console.log('Seeding collections…')
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i]
    const { error } = await supabase.from('collections').upsert({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      hero_tone: c.heroTone,
      is_active: true,
      sort_order: i,
    })
    if (error) console.error('Collection', c.slug, error.message)
  }

  console.log('Seeding products…')
  for (const p of products) {
    const { error: pErr } = await supabase.from('products').upsert({
      id: p.id,
      slug: p.slug,
      name: p.name,
      collection_slug: p.collection,
      type: p.type,
      description: p.description,
      price_fils: p.priceFils,
      compare_at_fils: p.compareAtFils,
      fabric_gsm: p.fabricGsm,
      fit_note: p.fitNote,
      tags: p.tags,
      is_drop: p.isDrop,
      drop_closes_at: p.dropClosesAt,
      is_active: p.isActive,
      best_seller: p.bestSeller ?? false,
    })
    if (pErr) console.error('Product', p.slug, pErr.message)

    for (const v of p.variants) {
      const { error: vErr } = await supabase.from('product_variants').upsert({
        id: v.id,
        product_id: p.id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        color_hex: v.colorHex,
        stock: v.stock,
      })
      if (vErr) console.error('Variant', v.id, vErr.message)
    }

    for (const img of p.images) {
      const { error: iErr } = await supabase.from('product_images').upsert({
        id: `${p.id}-img-${img.id}`,
        product_id: p.id,
        url: img.url,
        alt: img.alt,
        view: img.view,
        sort_order: img.sort,
      })
      if (iErr) console.error('Image', img.id, iErr.message)
    }
  }

  console.log(`Done — ${collections.length} collections, ${products.length} products.`)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
