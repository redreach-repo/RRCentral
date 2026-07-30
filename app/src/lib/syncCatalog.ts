import { db } from './db'
import { ALL_SEED_PRODUCTS, type SeedProduct } from './seedCatalog'
import type { Product } from './types'

export type SyncCatalogResult = {
  inserted: number
  updated: number
  total: number
}

/** Upsert seed products by SKU (does not delete custom products). */
export async function syncSeedCatalog(
  products: SeedProduct[] = ALL_SEED_PRODUCTS,
): Promise<SyncCatalogResult> {
  const { data, error } = await db.from('products').select('*')
  if (error) throw error
  const existing = (data || []) as Product[]
  const bySku = new Map(
    existing.filter((p) => p.sku).map((p) => [p.sku.trim().toUpperCase(), p]),
  )

  let inserted = 0
  let updated = 0
  const now = new Date().toISOString()

  for (const seed of products) {
    const key = seed.sku.trim().toUpperCase()
    const found = bySku.get(key)
    if (found) {
      const { error: err } = await db
        .from('products')
        .update({
          name: seed.name,
          division_code: seed.division_code,
          unit_price: seed.unit_price,
          moq: seed.moq,
          fabric: seed.fabric,
          unit: seed.unit,
          active: seed.active,
          notes: seed.notes,
          updated_at: now,
        })
        .eq('id', found.id)
      if (err) throw err
      updated += 1
    } else {
      const { error: err } = await db.from('products').insert({
        ...seed,
        updated_at: now,
      })
      if (err) throw err
      inserted += 1
    }
  }

  return { inserted, updated, total: products.length }
}
