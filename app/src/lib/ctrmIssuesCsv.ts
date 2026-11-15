/** CTRM issues list CSV column map (export / parse). */

import type { ColumnMap } from './listIo'

export const CTRM_ISSUES_CSV_COLUMNS: ColumnMap[] = [
  { key: 'subject', label: 'subject', required: true },
  { key: 'client', label: 'client' },
  { key: 'status', label: 'status' },
  { key: 'vendor_status', label: 'vendor_status' },
  { key: 'vendor_ticket_ref', label: 'vendor_ticket_ref' },
  { key: 'owner', label: 'owner' },
  { key: 'created_at', label: 'created_at' },
  { key: 'client_updated_at', label: 'client_updated_at' },
]
