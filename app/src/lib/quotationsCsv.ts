/** Quotations list CSV column map for listIo import (header drafts). */

import type { ColumnMap } from './listIo'

export const QUOTATIONS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'client', label: 'client', required: true },
  { key: 'amount', label: 'amount' },
  { key: 'date', label: 'date' },
  { key: 'valid_until', label: 'valid_until' },
  { key: 'description', label: 'description' },
  { key: 'notes', label: 'notes' },
  { key: 'status', label: 'status' },
]
