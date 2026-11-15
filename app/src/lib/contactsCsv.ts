/** Account contacts CSV column map for listIo import (M13 pilot). */

import type { ColumnMap } from './listIo'

export const CONTACT_CSV_COLUMNS: ColumnMap[] = [
  { key: 'name', label: 'name', required: true },
  { key: 'role', label: 'role' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'whatsapp', label: 'whatsapp' },
  { key: 'is_primary', label: 'is_primary' },
]
