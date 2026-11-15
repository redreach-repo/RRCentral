/** Per-warehouse stock stub helpers. */

export type WarehouseStockRow = {
  warehouse_id: string
  sku: string
  qty_on_hand: number
}

export function applyWarehouseDelta(
  rows: WarehouseStockRow[],
  warehouseId: string,
  sku: string,
  delta: number,
): WarehouseStockRow[] {
  const keySku = sku.trim()
  if (!warehouseId || !keySku) return rows
  const next = rows.map((r) => ({ ...r }))
  const idx = next.findIndex((r) => r.warehouse_id === warehouseId && r.sku === keySku)
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      qty_on_hand: Math.max(0, Number(next[idx].qty_on_hand || 0) + Number(delta || 0)),
    }
    return next
  }
  return [
    ...next,
    {
      warehouse_id: warehouseId,
      sku: keySku,
      qty_on_hand: Math.max(0, Number(delta || 0)),
    },
  ]
}

export function qtyForWarehouse(rows: WarehouseStockRow[], warehouseId: string, sku: string): number {
  const row = rows.find((r) => r.warehouse_id === warehouseId && r.sku === sku.trim())
  return Number(row?.qty_on_hand) || 0
}
