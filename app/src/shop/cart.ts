import { productById, type ShopProduct } from './catalog'
import { shippingFilsFor } from './format'

export type CartLine = {
  productId: string
  colorId: string
  size: string
  qty: number
}

export type ResolvedCartLine = CartLine & {
  product: ShopProduct
  lineFils: number
}

export function lineKey(line: Pick<CartLine, 'productId' | 'colorId' | 'size'>): string {
  return `${line.productId}::${line.colorId}::${line.size}`
}

export function clampQty(qty: number): number {
  const n = Math.floor(Number(qty) || 0)
  if (n < 1) return 0
  return Math.min(12, n)
}

export function addLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const qty = clampQty(incoming.qty)
  if (!qty) return lines
  const key = lineKey(incoming)
  let found = false
  const next = lines.map((line) => {
    if (lineKey(line) !== key) return line
    found = true
    return { ...line, qty: clampQty(line.qty + qty) }
  })
  if (found) return next.filter((line) => line.qty > 0)
  return [...lines, { ...incoming, qty }]
}

export function setLineQty(lines: CartLine[], key: string, qty: number): CartLine[] {
  const nextQty = clampQty(qty)
  return lines
    .map((line) => (lineKey(line) === key ? { ...line, qty: nextQty } : line))
    .filter((line) => line.qty > 0)
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => lineKey(line) !== key)
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + Math.max(0, line.qty), 0)
}

export function resolveLines(lines: CartLine[]): { valid: ResolvedCartLine[]; skipped: CartLine[] } {
  const valid: ResolvedCartLine[] = []
  const skipped: CartLine[] = []
  for (const line of lines) {
    const product = productById(line.productId)
    const qty = clampQty(line.qty)
    if (!product || !qty || !product.colorIds.includes(line.colorId)) {
      skipped.push(line)
      continue
    }
    valid.push({
      ...line,
      qty,
      product,
      lineFils: product.priceFils * qty,
    })
  }
  return { valid, skipped }
}

export function subtotalFils(lines: CartLine[]): number {
  return resolveLines(lines).valid.reduce((sum, line) => sum + line.lineFils, 0)
}

export function cartTotals(lines: CartLine[]) {
  const { valid, skipped } = resolveLines(lines)
  const subtotal = valid.reduce((sum, line) => sum + line.lineFils, 0)
  const shipping = shippingFilsFor(subtotal)
  return {
    valid,
    skipped,
    subtotalFils: subtotal,
    shippingFils: shipping,
    totalFils: subtotal + shipping,
    count: valid.reduce((sum, line) => sum + line.qty, 0),
  }
}

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify(lines)
}

export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const productId = String(r.productId || '')
        const colorId = String(r.colorId || '')
        const size = String(r.size || '')
        const qty = clampQty(Number(r.qty))
        if (!productId || !colorId || !size || !qty) return null
        return { productId, colorId, size, qty }
      })
      .filter((line): line is CartLine => Boolean(line))
  } catch {
    return []
  }
}
