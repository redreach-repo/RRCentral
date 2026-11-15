/** Delivery notes CSV column map for listIo import (Draft headers). */

import type { ColumnMap } from './listIo'

export const DELIVERY_NOTES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'client', label: 'client', required: true },
  { key: 'quote_ref', label: 'quote_ref' },
  { key: 'status', label: 'status' },
  { key: 'delivery_date', label: 'delivery_date' },
  { key: 'ship_to', label: 'ship_to' },
  { key: 'notes', label: 'notes' },
]
