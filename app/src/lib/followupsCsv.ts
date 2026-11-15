/** Follow-ups CSV column map — updates CRM rows matched by company_name. */

import type { ColumnMap } from './listIo'

export const FOLLOWUPS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'company_name', label: 'company_name', required: true },
  { key: 'follow_up_date', label: 'follow_up_date', required: true },
  { key: 'next_action', label: 'next_action' },
  { key: 'owner', label: 'owner' },
  { key: 'pipeline_stage', label: 'pipeline_stage' },
  { key: 'quote_ref', label: 'quote_ref' },
]
