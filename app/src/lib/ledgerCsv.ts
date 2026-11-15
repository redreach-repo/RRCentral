/** Chart of accounts CSV column map for listIo import/export. */

import type { ColumnMap } from './listIo'

export const LEDGER_COA_CSV_COLUMNS: ColumnMap[] = [
  { key: 'code', label: 'code', required: true },
  { key: 'name', label: 'name', required: true },
  { key: 'account_type', label: 'account_type', required: true },
  { key: 'is_postable', label: 'is_postable' },
  { key: 'is_active', label: 'is_active' },
  { key: 'notes', label: 'notes' },
]
