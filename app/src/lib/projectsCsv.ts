/** Delivery projects CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const PROJECTS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'code', label: 'code', required: true },
  { key: 'name', label: 'name', required: true },
  { key: 'budget_aed', label: 'budget_aed' },
  { key: 'retention_pct', label: 'retention_pct' },
]
