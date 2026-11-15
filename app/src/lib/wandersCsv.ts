/** Wanders deals CSV column map for listIo import/export. */

import type { ColumnMap } from './listIo'

export const WANDERS_CSV_COLUMNS: ColumnMap[] = [
  { key: 'client_name', label: 'client_name', required: true },
  { key: 'sales_stage', label: 'sales_stage' },
  { key: 'booking_status', label: 'booking_status' },
  { key: 'destination_country', label: 'destination_country' },
  { key: 'departure_date', label: 'departure_date' },
  { key: 'return_date', label: 'return_date' },
  { key: 'lead_contact', label: 'lead_contact' },
  { key: 'email', label: 'email' },
  { key: 'mobile', label: 'mobile' },
  { key: 'budget_amount', label: 'budget_amount' },
  { key: 'budget_currency', label: 'budget_currency' },
]
