/** Customer payments CSV column map for listIo import (matched by quote_ref). */

import type { ColumnMap } from './listIo'

export const PAYMENTS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'quote_ref', label: 'quote_ref', required: true },
  { key: 'payment_date', label: 'payment_date', required: true },
  { key: 'amount_received', label: 'amount_received', required: true },
  { key: 'currency', label: 'currency' },
  { key: 'payment_type', label: 'payment_type' },
  { key: 'status', label: 'status' },
  { key: 'transaction_ref', label: 'transaction_ref' },
  { key: 'payment_method', label: 'payment_method' },
  { key: 'client', label: 'client' },
]
