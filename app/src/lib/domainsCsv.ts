/** Owned domains CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const DOMAINS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'domain_name', label: 'domain_name', required: true },
  { key: 'registrar', label: 'registrar' },
  { key: 'status', label: 'status' },
  { key: 'expires_on', label: 'expires_on' },
  { key: 'auto_renew', label: 'auto_renew' },
  { key: 'cost_aed', label: 'cost_aed' },
  { key: 'billing_cycle', label: 'billing_cycle' },
  { key: 'notes', label: 'notes' },
]
