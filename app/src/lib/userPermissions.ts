import type { UserRole } from './types'

/**
 * Per-person switches on top of a role (table public.user_permissions,
 * migration 20261332090000_sales_own_clients.sql). Admins switch them on in
 * Settings, Users. The database enforces them; the screens only follow.
 *
 * Keep this list in step with the check constraint in that migration
 * (userPermissions.test.ts compares the two).
 */
export type UserPermissionKey =
  | 'clients.view_all'
  | 'finance.company'
  | 'quotes.margin'
  | 'export.csv'
  | 'ai.connector'

export type UserPermissionInfo = {
  key: UserPermissionKey
  label: string
  description: string
}

export const USER_PERMISSIONS: readonly UserPermissionInfo[] = [
  {
    key: 'clients.view_all',
    label: 'See all clients (read only)',
    description: 'Clients, leads and accounts of everyone. They can still only edit their own.',
  },
  {
    key: 'finance.company',
    label: 'See company money',
    description: 'Every invoice, payment, expense, vendor and report, as Sales could before the lock.',
  },
  {
    key: 'quotes.margin',
    label: 'See quote cost and margin',
    description: 'Supplier cost and gross profit on their quotes.',
  },
  {
    key: 'export.csv',
    label: 'Export to CSV',
    description: 'Download buttons on the pages they can see.',
  },
  {
    key: 'ai.connector',
    label: 'AI connector key',
    description: 'Lets an admin issue them an AI connector key.',
  },
]

export const USER_PERMISSION_KEYS: readonly UserPermissionKey[] = USER_PERMISSIONS.map((p) => p.key)

/** Roles the switches apply to. Admins and managers already see everything. */
export function rolesWithSwitches(): readonly UserRole[] {
  return ['sales']
}

/**
 * Whether the Sales lock applies to this person: Sales without the
 * "see company money" switch. Mirrors public.rr_sales_locked().
 */
export function isSalesLocked(role: UserRole | null | undefined, granted: readonly string[]): boolean {
  return role === 'sales' && !granted.includes('finance.company')
}

/** Whether a person has a switch. Admins and managers count as having all of them. */
export function hasUserPermission(
  role: UserRole | null | undefined,
  granted: readonly string[],
  key: UserPermissionKey,
): boolean {
  if (role === 'admin' || role === 'manager') return true
  return granted.includes(key)
}
