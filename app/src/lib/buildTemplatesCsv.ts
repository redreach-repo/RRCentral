/** Build templates list CSV column map for listIo export/import. */

import type { ColumnMap } from './listIo'

export const BUILD_TEMPLATES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'code', label: 'code', required: true },
  { key: 'name', label: 'name', required: true },
  { key: 'description', label: 'description' },
  { key: 'package_id', label: 'package_id' },
  { key: 'active', label: 'active' },
]
