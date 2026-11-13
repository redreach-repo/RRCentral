import type { ContractClauseCategory, ContractClauseStatus } from './types'

export const CLAUSE_CATEGORIES: { value: ContractClauseCategory; label: string }[] = [
  { value: 'confidentiality', label: 'Confidentiality' },
  { value: 'obligations', label: 'Obligations' },
  { value: 'term', label: 'Term' },
  { value: 'liability', label: 'Liability' },
  { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
]

export const CLAUSE_STATUSES: { value: ContractClauseStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'retired', label: 'Retired' },
]

export function clauseCategoryLabel(value: string): string {
  return CLAUSE_CATEGORIES.find((c) => c.value === value)?.label || value
}

export function clauseStatusLabel(value: string): string {
  return CLAUSE_STATUSES.find((s) => s.value === value)?.label || value
}
