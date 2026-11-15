/** Catalog product CSV column map for listIo import (M13 pilot). */

import type { ColumnMap } from './listIo'

export const CATALOG_CSV_COLUMNS: ColumnMap[] = [
  { key: 'sku', label: 'sku', required: true },
  { key: 'name', label: 'name', required: true },
  { key: 'division_code', label: 'division_code' },
  { key: 'unit_price', label: 'unit_price' },
  { key: 'unit_cost', label: 'unit_cost' },
  { key: 'stock_on_hand', label: 'stock_on_hand' },
  { key: 'active', label: 'active' },
]
