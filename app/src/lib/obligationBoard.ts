import type { ContractObligationOwner, ContractObligationStatus } from './types'

export const OBLIGATION_OWNERS: { value: ContractObligationOwner; label: string }[] = [
  { value: 'red_reach', label: 'Red Reach' },
  { value: 'counterparty', label: 'Counterparty' },
  { value: 'both', label: 'Both' },
]

export const OBLIGATION_STATUSES: { value: ContractObligationStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function obligationOwnerLabel(value: string): string {
  return OBLIGATION_OWNERS.find((o) => o.value === value)?.label || value
}

export function obligationStatusLabel(value: string): string {
  return OBLIGATION_STATUSES.find((s) => s.value === value)?.label || value
}

/** True when open and due_date is before today (YYYY-MM-DD). */
export function obligationIsOverdue(
  row: { status: string; due_date: string | null },
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  return row.status === 'open' && Boolean(row.due_date) && String(row.due_date) < today
}
