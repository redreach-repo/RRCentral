/** HR attendance CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const HR_ATTENDANCE_CSV_COLUMNS: ColumnMap[] = [
  { key: 'employee_code', label: 'employee_code', required: true },
  { key: 'work_date', label: 'work_date', required: true },
  { key: 'status', label: 'status' },
  { key: 'hours', label: 'hours' },
  { key: 'notes', label: 'notes' },
]
