/** Contract clause library CSV column map for listIo import/export. */

import type { ColumnMap } from './listIo'

export const CLAUSE_LIBRARY_CSV_COLUMNS: ColumnMap[] = [
  { key: 'clause_key', label: 'clause_key', required: true },
  { key: 'title', label: 'title', required: true },
  { key: 'body', label: 'body', required: true },
  { key: 'category', label: 'category' },
  { key: 'status', label: 'status' },
  { key: 'sort_order', label: 'sort_order' },
  { key: 'notes', label: 'notes' },
]
