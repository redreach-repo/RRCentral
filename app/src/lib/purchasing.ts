/** M9 purchase order helpers (pure). */

export type PoStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'canceled'

export function nextPoNumber(existing: string[], orderDate: string): string {
  const y = (orderDate || '').slice(0, 4) || String(new Date().getUTCFullYear())
  const prefix = `PO-${y}-`
  let max = 0
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue
    const part = Number(n.slice(prefix.length))
    if (Number.isFinite(part) && part > max) max = part
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function poReceiveRemaining(qtyOrdered: number, qtyReceived: number): number {
  return Math.max(0, Number(qtyOrdered || 0) - Number(qtyReceived || 0))
}

export function rollupPoStatus(lines: { qty_ordered: number; qty_received: number }[]): PoStatus {
  if (!lines.length) return 'draft'
  const anyRecv = lines.some((l) => Number(l.qty_received) > 0)
  const allRecv = lines.every((l) => Number(l.qty_received) >= Number(l.qty_ordered) && Number(l.qty_ordered) > 0)
  if (allRecv) return 'received'
  if (anyRecv) return 'partial'
  return 'ordered'
}
