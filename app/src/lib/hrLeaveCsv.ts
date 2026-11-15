/** HR leave CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const HR_LEAVE_CSV_COLUMNS: ColumnMap[] = [
  { key: 'employee_code', label: 'employee_code', required: true },
  { key: 'leave_type', label: 'leave_type' },
  { key: 'starts_on', label: 'starts_on', required: true },
  { key: 'ends_on', label: 'ends_on', required: true },
  { key: 'reason', label: 'reason' },
]
