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

/**
 * Hierarchy: admin > manager > sales
 *
 * - admin: full company control (users, secrets, deletes, mark paid)
 * - manager: run the pipeline & ops without Settings/secrets
 * - sales: day-to-day CRM / quotes / invoices (no hard finance deletes)
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
  ]),
  manager: new Set<Permission>([
    'crm.reassignOwner',
    'crm.deleteAny',
    'quote.deleteAny',
    'finance.reports',
    'crm.viewAll',
  ]),
  sales: new Set<Permission>(['finance.reports']),
}

export const USER_ROLES: UserRole[] = ['admin', 'manager', 'sales']

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  sales: 'Sales',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Users, Settings, secrets, audit, delete invoices/expenses, mark paid',
  manager: 'All CRM data, reassign owners, delete quotes/CRM mistakes — no Settings/secrets',
  sales: 'CRM, quotes, invoices day-to-day — no Settings, audit, or hard finance deletes',
}

export function normalizeUserRole(role: unknown): UserRole {
  if (role === 'admin' || role === 'manager' || role === 'sales') return role
  return 'sales'
}

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  const r = normalizeUserRole(role)
  return ROLE_PERMISSIONS[r].has(permission)
}

export function roleAtLeast(role: UserRole | null | undefined, minimum: UserRole): boolean {
  const order: Record<UserRole, number> = { sales: 1, manager: 2, admin: 3 }
  return order[normalizeUserRole(role)] >= order[minimum]
}
