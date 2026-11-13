/**
 * M1 field-mask foundation: named sensitive fields mapped to existing Permission keys.
 * UI should call canViewField / canEditField instead of raw can() for these.
 * No RLS / DB changes in this slice.
 */
import { can, type Permission } from './permissions'
import type { UserRole } from './types'

export type FieldKey =
  | 'ctrm.commission'
  | 'finance.profit'
  | 'delivery.profitability'
  | 'company.trn'
  | 'company.bank'
  | 'vendor.trn'

type FieldRule = {
  /** Capability required to see the value. */
  view: Permission | Permission[]
  /** Capability required to change the value (defaults to view). */
  edit?: Permission | Permission[]
}

/**
 * Registry of sensitive fields. Expand carefully — prefer reusing Permission
 * strings already enforced in RLS where possible.
 */
export const FIELD_RULES: Record<FieldKey, FieldRule> = {
  'ctrm.commission': { view: 'ctrm.commission' },
  'finance.profit': { view: 'finance.profit' },
  'delivery.profitability': { view: 'delivery.profitability' },
  'company.trn': { view: 'settings.manage' },
  'company.bank': { view: 'settings.manage' },
  /** Vendor TRN on expense/vendor screens. */
  'vendor.trn': { view: ['accounts.viewAll', 'accounts.write'], edit: 'accounts.write' },
}

function anyPermission(role: UserRole | null | undefined, needed: Permission | Permission[]): boolean {
  const list = Array.isArray(needed) ? needed : [needed]
  return list.some((p) => can(role, p))
}

export function canViewField(role: UserRole | null | undefined, field: FieldKey): boolean {
  return anyPermission(role, FIELD_RULES[field].view)
}

export function canEditField(role: UserRole | null | undefined, field: FieldKey): boolean {
  const rule = FIELD_RULES[field]
  return anyPermission(role, rule.edit ?? rule.view)
}

/** All FieldKeys a role may view (for tests / debug). */
export function visibleFields(role: UserRole | null | undefined): FieldKey[] {
  return (Object.keys(FIELD_RULES) as FieldKey[]).filter((k) => canViewField(role, k))
}
