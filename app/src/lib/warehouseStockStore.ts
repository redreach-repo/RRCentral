import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import type { WarehouseStockRow } from './warehouseStock'

export type WarehouseStockListRow = WarehouseStockRow & {
  id: string
  warehouse_code?: string
  warehouse_name?: string
}

export async function listWarehouseStock(): Promise<WarehouseStockListRow[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('warehouse_stock')
    .select('id, warehouse_id, sku, qty_on_hand, warehouses(code, name)')
    .order('sku')
    .limit(500)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []).map((r: {
    id: string
    warehouse_id: string
    sku: string
    qty_on_hand: number
    warehouses?: { code?: string; name?: string } | { code?: string; name?: string }[] | null
  }) => {
    const wh = Array.isArray(r.warehouses) ? r.warehouses[0] : r.warehouses
    return {
      id: r.id,
      warehouse_id: r.warehouse_id,
      sku: r.sku,
      qty_on_hand: Number(r.qty_on_hand) || 0,
      warehouse_code: wh?.code || '',
      warehouse_name: wh?.name || '',
    }
  })
}
