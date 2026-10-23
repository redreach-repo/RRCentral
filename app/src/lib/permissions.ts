import type { UserRole } from './types'

/** Capability keys used across Central UI (and documented for RLS). */
export type Permission =
  | 'settings.manage'
  | 'users.manage'
  | 'audit.read'
  | 'invoice.delete'
  | 'invoice.markPaid'
  | 'expense.delete'
  | 'crm.reassignOwner'
  | 'crm.deleteAny'
  | 'quote.deleteAny'
  | 'finance.reports'
  | 'crm.viewAll'
  | 'legacy.access'
  | 'accounts.viewAll'
  | 'accounts.write'
  | 'accounts.reassign'
  | 'accounts.delete'
  | 'delivery.contracts'
  | 'delivery.packages'
  | 'delivery.rates'
  | 'delivery.profitability'
  | 'support.policies'
  | 'support.workingWeek'

/**
 * Hierarchy: admin > manager > sales, plus two restricted roles
 *
 * - admin: full company control (users, secrets, deletes, mark paid)
 * - manager: run the pipeline & ops without Settings/secrets
 * - sales: day-to-day CRM / quotes / invoices (no hard finance deletes)
 * - staff: VA / freelancers, only the accounts assigned to them, no old modules
 * - viewer: read only, everywhere except Settings and the audit log
 *
 * Mirrors RLS in 20261023090000_accounts_foundation.sql.
 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    'settings.manage',
    'users.manage',
    'audit.read',
    'invoice.delete',
    'invoice.markPaid',
    'expense.delete',
    'crm.reassignOwner',
    'crm.deleteAny',
    'quote.deleteAny',
    'finance.reports',
    'crm.viewAll',
    'legacy.access',
    'accounts.viewAll',
    'accounts.write',
    'accounts.reassign',
    'accounts.delete',
    'delivery.contracts',
    'delivery.packages',
    'delivery.rates',
    'delivery.profitability',
    'support.policies',
    'support.workingWeek',
  ]),
  manager: new Set<Permission>([
    'crm.reassignOwner',
    'crm.deleteAny',
    'quote.deleteAny',
    'finance.reports',
    'crm.viewAll',
    'legacy.access',
    'accounts.viewAll',
    'accounts.write',
    'accounts.reassign',
    'accounts.delete',
    'delivery.contracts',
    'delivery.packages',
    'delivery.profitability',
    'support.policies',
  ]),
  sales: new Set<Permission>([
    'finance.reports',
    'legacy.access',
    'accounts.viewAll',
    'accounts.write',
    'delivery.contracts',
  ]),
  staff: new Set<Permission>(['accounts.write']),
  viewer: new Set<Permission>(['legacy.access', 'accounts.viewAll']),
}

export const USER_ROLES: UserRole[] = ['admin', 'manager', 'sales', 'staff', 'viewer']

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  sales: 'Sales',
  staff: 'Staff',
  viewer: 'Viewer',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Users, Settings, secrets, audit, delete invoices/expenses, mark paid',
  manager: 'All CRM data, reassign owners, delete quotes/CRM mistakes — no Settings/secrets',
  sales: 'CRM, quotes, invoices day-to-day — no Settings, audit, or hard finance deletes',
  staff: 'Only the accounts assigned to them. For the VA and freelancers',
  viewer: 'Can look at everything except Settings and the audit log. Cannot change anything',
}

export function normalizeUserRole(role: unknown): UserRole {
  if (
    role === 'admin' ||
    role === 'manager' ||
    role === 'sales' ||
    role === 'staff' ||
    role === 'viewer'
  ) {
    return role
  }
  return 'sales'
}

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  const r = normalizeUserRole(role)
  return ROLE_PERMISSIONS[r].has(permission)
}

export function roleAtLeast(role: UserRole | null | undefined, minimum: UserRole): boolean {
  const order: Record<UserRole, number> = { viewer: 0, staff: 0, sales: 1, manager: 2, admin: 3 }
  return order[normalizeUserRole(role)] >= order[minimum]
}
