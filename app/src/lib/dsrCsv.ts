/** Data subject request CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const DSR_CSV_COLUMNS: ColumnMap[] = [
  { key: 'request_type', label: 'request_type', required: true },
  { key: 'subject_email', label: 'subject_email', required: true },
  { key: 'subject_name', label: 'subject_name' },
  { key: 'detail', label: 'detail' },
]
