/** HR people directory CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const HR_PEOPLE_CSV_COLUMNS: ColumnMap[] = [
  { key: 'full_name', label: 'full_name', required: true },
  { key: 'employee_code', label: 'employee_code' },
  { key: 'email', label: 'email' },
  { key: 'job_title', label: 'job_title' },
  { key: 'department', label: 'department' },
  { key: 'employment_status', label: 'employment_status' },
  { key: 'start_date', label: 'start_date' },
  { key: 'basic_salary_aed', label: 'basic_salary_aed' },
  { key: 'reports_to_id', label: 'reports_to_id' },
]
