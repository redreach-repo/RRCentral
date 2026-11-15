/** Account list CSV column map for listIo import (M13 pilot). */

import type { ColumnMap } from './listIo'

export const ACCOUNT_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'type', label: 'type', required: true },
  { key: 'status', label: 'status' },
  { key: 'industry', label: 'industry' },
  { key: 'country', label: 'country' },
  { key: 'city', label: 'city' },
  { key: 'website', label: 'website' },
  { key: 'source', label: 'source' },
  { key: 'notes', label: 'notes' },
]
