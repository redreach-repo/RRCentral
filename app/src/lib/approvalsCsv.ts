/** Approval requests CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const APPROVALS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'object_type', label: 'object_type', required: true },
  { key: 'object_id', label: 'object_id', required: true },
  { key: 'action', label: 'action', required: true },
  { key: 'amount_aed', label: 'amount_aed' },
]
