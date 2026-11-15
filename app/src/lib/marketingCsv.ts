/** Marketing campaigns CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const MARKETING_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'channel', label: 'channel' },
  { key: 'status', label: 'status' },
  { key: 'starts_on', label: 'starts_on' },
  { key: 'ends_on', label: 'ends_on' },
  { key: 'budget_aed', label: 'budget_aed' },
  { key: 'notes', label: 'notes' },
]
