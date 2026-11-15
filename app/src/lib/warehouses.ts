/** Multi-warehouse stub helpers. */

export type Warehouse = {
  id: string
  code: string
  name: string
  is_default: boolean
  active: boolean
}

export function defaultWarehouse(rows: Warehouse[]): Warehouse | null {
  return rows.find((w) => w.is_default && w.active) || rows.find((w) => w.active) || null
}

export function warehouseLabel(w: Warehouse): string {
  return `${w.code} · ${w.name}`
}
