import { db } from './db'
import {
  buildConnectCatalogue,
  buildMarketingCatalogue,
  buildTradingCatalogue,
} from './seedDivisionCatalogues'
import type { Product } from './types'

async function ensureProducts(rows: Product[]): Promise<number> {
  let added = 0
  for (const p of rows) {
    const { data } = await db.from('products').select('id').eq('id', p.id).maybeSingle()
    if (data) continue
    const bySku = await db
      .from('products')
      .select('id')
      .eq('sku', p.sku)
      .eq('division_code', p.division_code)
      .maybeSingle()
    if (bySku.data) continue
    const { error } = await db.from('products').insert(p)
    if (error) throw error
    added += 1
  }
  return added
}

/** Seed Marketing / Connect / Trading catalogues without touching Threads SKUs. */
export async function ensureDivisionCataloguesSeeded(): Promise<{
  marketing: number
  connect: number
  trading: number
}> {
  const marketing = await ensureProducts(buildMarketingCatalogue())
  const connect = await ensureProducts(buildConnectCatalogue())
  const trading = await ensureProducts(buildTradingCatalogue())
  return { marketing, connect, trading }
}
