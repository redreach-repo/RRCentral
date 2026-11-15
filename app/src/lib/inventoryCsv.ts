/** Inventory stock-adjust CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const INVENTORY_ADJUST_CSV_COLUMNS: ColumnMap[] = [
  { key: 'sku', label: 'sku', required: true },
  { key: 'qty_delta', label: 'qty_delta', required: true },
  { key: 'reason', label: 'reason' },
  { key: 'reference', label: 'reference' },
]
