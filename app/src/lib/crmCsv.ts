/** CRM list CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const CRM_CSV_COLUMNS: ColumnMap[] = [
  { key: 'company_name', label: 'company_name', required: true },
  { key: 'pipeline_stage', label: 'pipeline_stage' },
  { key: 'company_owner', label: 'company_owner' },
  { key: 'follow_up_date', label: 'follow_up_date' },
  { key: 'next_action', label: 'next_action' },
  { key: 'owner', label: 'owner' },
  { key: 'notes', label: 'notes' },
]
