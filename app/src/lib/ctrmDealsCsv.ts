/** CTRM deals board CSV column map (export). */

import type { ColumnMap } from './listIo'

export const CTRM_DEALS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'company', label: 'company', required: true },
  { key: 'stage', label: 'stage' },
  { key: 'region', label: 'region' },
  { key: 'company_type', label: 'company_type' },
  { key: 'owner', label: 'owner' },
  { key: 'next_action', label: 'next_action' },
  { key: 'next_action_date', label: 'next_action_date' },
  { key: 'last_touch_at', label: 'last_touch_at' },
]
