/** WorshipHub churches CSV column map for ProductsPage listIo import. */

import type { ColumnMap } from './listIo'

/** Matches ProductsPage Export CSV headers. */
export const PRODUCTS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'tenant_slug', label: 'tenant_slug' },
  { key: 'plan', label: 'plan' },
  { key: 'billing_status', label: 'billing_status' },
  { key: 'renewal_date', label: 'renewal_date' },
  { key: 'source', label: 'source' },
  { key: 'status', label: 'status' },
]
