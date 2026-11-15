/** Construction sites CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const CONSTRUCTION_SITES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'code', label: 'code' },
  { key: 'location', label: 'location' },
  { key: 'status', label: 'status' },
]
