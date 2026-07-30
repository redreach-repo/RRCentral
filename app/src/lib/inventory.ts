import { db } from './db'
import { parseSizesJson, sumSizes, type SizeBreakdown } from './sizes'
import { resolveSkuFromDescription } from './seedCatalog'
import type { LineItem, Product } from './types'

export type InventoryMovement = {
  id: string
  sku: string
  qty_delta: number
  reserved_delta: number
  reason: string
  reference: string
  user_email: string
  created_at: string
}

export function availableStock(p: Pick<Product, 'stock_on_hand' | 'stock_reserved'>): number {
  return Math.max(0, Number(p.stock_on_hand || 0) - Number(p.stock_reserved || 0))
}

async function findProductBySku(sku: string): Promise<Product | null> {
  const key = sku.trim()
  if (!key) return null
  const { data, error } = await db.from('products').select('*').eq('sku', key).limit(1)
  if (error || !data?.length) return null
  return (data as Product[])[0] || null
}

async function logMovement(row: Omit<InventoryMovement, 'id' | 'created_at'>): Promise<void> {
  await db.from('inventory_movements').insert({
    ...row,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  })
}

export async function adjustStock(opts: {
  sku: string
  qtyDelta?: number
  reservedDelta?: number
  reason: string
  reference?: string
  userEmail?: string
}): Promise<Product | null> {
  const product = await findProductBySku(opts.sku)
  if (!product) return null

  const qtyDelta = Number(opts.qtyDelta || 0)
  const reservedDelta = Number(opts.reservedDelta || 0)
  const nextOnHand = Math.max(0, Number(product.stock_on_hand || 0) + qtyDelta)
  const nextReserved = Math.max(0, Number(product.stock_reserved || 0) + reservedDelta)

  const { error } = await db
    .from('products')
    .update({
      stock_on_hand: nextOnHand,
      stock_reserved: nextReserved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', product.id)
  if (error) throw error

  await logMovement({
    sku: product.sku,
    qty_delta: qtyDelta,
    reserved_delta: reservedDelta,
    reason: opts.reason,
    reference: opts.reference || '',
    user_email: opts.userEmail || '',
  })

  return {
    ...product,
    stock_on_hand: nextOnHand,
    stock_reserved: nextReserved,
  }
}

function skuFromLine(line: Pick<LineItem, 'description' | 'remarks'> & { sku?: string | null }): string | null {
  if (line.sku) return line.sku.trim()
  const fromDesc = resolveSkuFromDescription(line.description)
  if (fromDesc) return fromDesc
  const m = String(line.description || '').match(/^([A-Z]{3}-\d{3}(?:-[A-Z0-9]+)?)\b/)
  return m ? m[1] : null
}

function qtyFromLine(line: LineItem): number {
  const sizes = parseSizesJson((line as LineItem & { sizes_json?: unknown }).sizes_json)
  if (sizes) return sumSizes(sizes)
  return Number(line.qty) || 0
}

/** When a quote is Awarded — reserve stock for its lines. */
export async function reserveStockForQuote(opts: {
  lines: LineItem[]
  quoteRef: string
  userEmail?: string
}): Promise<number> {
  let touched = 0
  for (const line of opts.lines) {
    const sku = skuFromLine(line)
    const qty = qtyFromLine(line)
    if (!sku || qty <= 0) continue
    const p = await adjustStock({
      sku,
      reservedDelta: qty,
      reason: 'reserve_award',
      reference: opts.quoteRef,
      userEmail: opts.userEmail,
    })
    if (p) touched += 1
  }
  return touched
}

/** Release reservation when quote is Not awarded / lost / superseded. */
export async function releaseStockForQuote(opts: {
  lines: LineItem[]
  quoteRef: string
  userEmail?: string
}): Promise<number> {
  let touched = 0
  for (const line of opts.lines) {
    const sku = skuFromLine(line)
    const qty = qtyFromLine(line)
    if (!sku || qty <= 0) continue
    const p = await adjustStock({
      sku,
      reservedDelta: -qty,
      reason: 'release_reservation',
      reference: opts.quoteRef,
      userEmail: opts.userEmail,
    })
    if (p) touched += 1
  }
  return touched
}

/**
 * Convert reserved → consumed when invoicing an awarded quote.
 * If nothing was reserved, deduct from on-hand directly.
 */
export async function commitStockForInvoice(opts: {
  lines: LineItem[]
  invoiceRef: string
  userEmail?: string
}): Promise<number> {
  let touched = 0
  for (const line of opts.lines) {
    const sku = skuFromLine(line)
    const qty = qtyFromLine(line)
    if (!sku || qty <= 0) continue
    const product = await findProductBySku(sku)
    if (!product) continue
    const reserved = Number(product.stock_reserved || 0)
    const release = Math.min(reserved, qty)
    const p = await adjustStock({
      sku,
      qtyDelta: -qty,
      reservedDelta: -release,
      reason: 'invoice_commit',
      reference: opts.invoiceRef,
      userEmail: opts.userEmail,
    })
    if (p) touched += 1
  }
  return touched
}

export function applySizeStockDelta(
  sizeStock: SizeBreakdown | null | undefined,
  sizes: SizeBreakdown | null | undefined,
  sign: 1 | -1,
): SizeBreakdown {
  const next: SizeBreakdown = { ...(sizeStock || {}) }
  if (!sizes) return next
  for (const [k, v] of Object.entries(sizes)) {
    const n = Number(v) || 0
    if (!n) continue
    next[k] = Math.max(0, Number(next[k] || 0) + sign * n)
  }
  return next
}
