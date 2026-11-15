/** Purchase orders CSV column map for listIo import (header + first line). */

import type { ColumnMap } from './listIo'

export const PURCHASE_ORDERS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'vendor_name', label: 'vendor_name', required: true },
  { key: 'sku', label: 'sku' },
  { key: 'description', label: 'description' },
  { key: 'qty', label: 'qty' },
  { key: 'unit_cost', label: 'unit_cost' },
  { key: 'landed_cost_aed', label: 'landed_cost_aed' },
  { key: 'order_date', label: 'order_date' },
]
