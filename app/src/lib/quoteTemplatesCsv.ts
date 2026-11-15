/** Quote templates list CSV column map for listIo export/import. */

import type { ColumnMap } from './listIo'

export const QUOTE_TEMPLATES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'division_code', label: 'division_code', required: true },
  { key: 'description', label: 'description' },
  { key: 'items_json', label: 'items_json' },
]
