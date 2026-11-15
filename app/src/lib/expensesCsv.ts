/** Expenses list CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const EXPENSES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'date', label: 'date', required: true },
  { key: 'vendor', label: 'vendor', required: true },
  { key: 'category', label: 'category' },
  { key: 'amount', label: 'amount', required: true },
  { key: 'payment_method', label: 'payment_method' },
  { key: 'notes', label: 'notes' },
  { key: 'quote_ref', label: 'quote_ref' },
]
