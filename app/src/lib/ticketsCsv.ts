/** Support tickets CSV column map for listIo draft import. */

import type { ColumnMap } from './listIo'

export const TICKETS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'subject', label: 'subject', required: true },
  { key: 'account', label: 'account', required: true },
  { key: 'priority', label: 'priority' },
  { key: 'channel', label: 'channel' },
  { key: 'details', label: 'details' },
]
