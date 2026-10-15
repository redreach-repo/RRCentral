import { db } from './db'
import type { DraftLineItem } from './lineItems'
import type { Product } from './types'

/** Short division codes used at the start of generated SKUs. */
const DIVISION_SKU_PREFIX: Record<string, string> = {
  '01': 'THR', // RR Threads
  '02': 'WAN', // RR Wanders
  '03': 'MKT', // RR Marketing
  '04': 'CON', // RR Connect
  '05': 'CAR', // RR Care
  '06': 'TRD', // RR Trading
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'on', 'in', 'to', 'for', 'with', 'by', 'at', 'from', 'per', 'or', 'x',
])

export function skuPrefix(divisionCode: string | null | undefined): string {
  return DIVISION_SKU_PREFIX[String(divisionCode || '01').padStart(2, '0')] || 'RR'
}

/** Initials of the first three meaningful words, e.g. "Dark Grey Shirt and Pants" → "DGS". */
export function descriptionCode(description: string): string {
  const words = description
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && /[A-Za-z]/.test(w) && !STOP_WORDS.has(w.toLowerCase()))
  const code = words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join('')
  return code || 'ITM'
}

/** Next free SKU for prefix+code, e.g. THR-DGS-003 when 001 and 002 exist. */
export function nextSku(prefix: string, code: string, existing: Iterable<string>): string {
  const pattern = new RegExp(`^${prefix}-${code}-(\\d+)$`, 'i')
  let max = 0
  for (const sku of existing) {
    const m = String(sku || '').trim().match(pattern)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${code}-${String(max + 1).padStart(3, '0')}`
}

/** Compare item names loosely: case, punctuation and spacing don't matter. */
export function normalizeItemName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Catalog product whose name matches this line (also "SKU — Name" lines added from the catalog). */
export function findCatalogMatch(
  description: string,
  products: Pick<Product, 'sku' | 'name' | 'fabric'>[],
): Pick<Product, 'sku' | 'name' | 'fabric'> | null {
  const target = normalizeItemName(description)
  if (!target) return null
  for (const p of products) {
    if (!p.sku) continue
    const name = normalizeItemName(p.name)
    const withFabric = normalizeItemName(`${p.name} (${p.fabric || ''})`)
    const withSku = normalizeItemName(`${p.sku} ${p.name}`)
    const withSkuFabric = normalizeItemName(`${p.sku} ${p.name} ${p.fabric || ''}`)
    if (target === name || target === withFabric || target === withSku || target === withSkuFabric) {
      return p
    }
  }
  return null
}

export type NewCatalogProduct = {
  sku: string
  name: string
  division_code: string
  unit_price: number
  unit_cost: number
  moq: number
  unit: string
  active: boolean
  track_sizes: boolean
  notes: string
}

/**
 * Give every described line an SKU: reuse a matching catalog item, otherwise
 * generate one and describe the catalog product to create for it. Lines with
 * the same description in one document share one new SKU. Pure — no I/O.
 */
export function assignLineItemSkus(
  items: DraftLineItem[],
  divisionCode: string,
  products: Pick<Product, 'sku' | 'name' | 'fabric'>[],
  sourceRef = '',
): { items: DraftLineItem[]; newProducts: NewCatalogProduct[] } {
  const prefix = skuPrefix(divisionCode)
  const takenSkus = new Set(products.map((p) => p.sku).filter(Boolean))
  const newProducts: NewCatalogProduct[] = []
  const createdByName = new Map<string, string>()

  const out = items.map((item) => {
    const description = item.description.trim()
    if (!description || String(item.sku || '').trim()) return item

    const key = normalizeItemName(description)
    const match = findCatalogMatch(description, products)
    if (match) return { ...item, sku: match.sku }

    const already = createdByName.get(key)
    if (already) return { ...item, sku: already }

    const sku = nextSku(prefix, descriptionCode(description), takenSkus)
    takenSkus.add(sku)
    createdByName.set(key, sku)
    const qty = Number(item.qty) || 0
    newProducts.push({
      sku,
      name: description.slice(0, 300),
      division_code: String(divisionCode || '01').padStart(2, '0'),
      unit_price: Number(item.unit_price) || 0,
      unit_cost: Number(item.unit_cost) || 0,
      moq: qty > 0 ? Math.round(qty) : 1,
      unit: 'pcs',
      active: true,
      track_sizes: Boolean(item.sizes),
      notes: sourceRef ? `Added automatically from ${sourceRef}` : 'Added automatically from a quotation',
    })
    return { ...item, sku }
  })

  return { items: out, newProducts }
}

/**
 * Ensure every line has an SKU and every SKU exists in the catalog / inventory,
 * so the item can be recalled later from "Add from catalog".
 * Returns the lines with SKUs filled in and how many catalog items were added.
 */
export async function registerLineItemSkus(
  items: DraftLineItem[],
  divisionCode: string,
  sourceRef = '',
): Promise<{ items: DraftLineItem[]; added: number }> {
  if (!items.some((i) => i.description.trim() && !String(i.sku || '').trim())) {
    return { items, added: 0 }
  }
  // All divisions: SKUs must be unique across the whole catalog.
  const { data, error } = await db.from('products').select('sku, name, fabric, division_code')
  if (error) throw error
  const all = (data || []) as Pick<Product, 'sku' | 'name' | 'fabric' | 'division_code'>[]
  const sameDivision = all.filter(
    (p) => String(p.division_code || '01').padStart(2, '0') === String(divisionCode || '01').padStart(2, '0'),
  )

  // Match names within the division, but count every SKU as taken.
  const { items: withSkus, newProducts } = assignLineItemSkus(items, divisionCode, sameDivision, sourceRef)
  const taken = new Set(all.map((p) => p.sku).filter(Boolean))
  for (const p of newProducts) {
    if (taken.has(p.sku)) {
      // Collision with another division's SKU — bump to the next free number.
      const parts = p.sku.split('-')
      const fresh = nextSku(parts[0], parts[1], taken)
      withSkus.forEach((i, idx) => {
        if (i.sku === p.sku) withSkus[idx] = { ...i, sku: fresh }
      })
      p.sku = fresh
    }
    taken.add(p.sku)
  }

  if (newProducts.length) {
    const { error: insertError } = await db.from('products').insert(newProducts)
    if (insertError) throw insertError
  }
  return { items: withSkus, added: newProducts.length }
}
