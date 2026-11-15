/** Contract obligations CSV column map for listIo import/export. */

import type { ColumnMap } from './listIo'

export const OBLIGATIONS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'company_name', label: 'company_name', required: true },
  { key: 'title', label: 'title', required: true },
  { key: 'owner_party', label: 'owner_party' },
  { key: 'due_date', label: 'due_date' },
  { key: 'status', label: 'status' },
  { key: 'description', label: 'description' },
  { key: 'crm_id', label: 'crm_id' },
]
