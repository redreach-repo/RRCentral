/** Vendor list CSV column map for listIo import (M13 pilot). */

import type { ColumnMap } from './listIo'

export const VENDOR_CSV_COLUMNS: ColumnMap[] = [
  { key: 'company_name', label: 'company_name', required: true },
  { key: 'primary_contact', label: 'primary_contact' },
  { key: 'email', label: 'email' },
  { key: 'mobile', label: 'mobile' },
  { key: 'trn', label: 'trn' },
]
