/** Payroll runs CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const PAYROLL_CSV_COLUMNS: ColumnMap[] = [
  { key: 'period_yyyy_mm', label: 'period_yyyy_mm', required: true },
  { key: 'notes', label: 'notes' },
]
