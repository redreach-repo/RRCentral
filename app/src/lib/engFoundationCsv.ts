/** Engineering document/claim register CSV column map for listIo import. */

import type { ColumnMap } from './listIo'

export const ENG_FOUNDATION_CSV_COLUMNS: ColumnMap[] = [
  { key: 'kind', label: 'kind', required: true },
  { key: 'number', label: 'number' },
  { key: 'title', label: 'title', required: true },
  { key: 'discipline', label: 'discipline' },
  { key: 'amount_aed', label: 'amount_aed' },
]
