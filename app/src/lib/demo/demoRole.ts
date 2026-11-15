/**
 * Demo-only UI role override (Master Spec M3a / docs/DECISIONS.md D5).
 * Does not change Postgres RLS — only what the React shell thinks the role is.
 */

import type { UserRole } from '../types'
import { normalizeUserRole } from '../permissions'
import { isDemoBuild } from './demoMode'

export const DEMO_ROLE_STORAGE_KEY = 'highmast_demo_role'
export const DEMO_ROLE_EVENT = 'highmast-demo-role'

export const DEMO_ROLES: UserRole[] = ['admin', 'manager', 'sales', 'staff', 'viewer']

export function readDemoRoleOverride(
  storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  env: { VITE_APP_ENV?: string } = import.meta.env as { VITE_APP_ENV?: string },
): UserRole | null {
  if (!isDemoBuild(env) || !storage) return null
  const raw = storage.getItem(DEMO_ROLE_STORAGE_KEY)
  if (!raw) return null
  try {
    return normalizeUserRole(raw)
  } catch {
    return null
  }
}

export function writeDemoRoleOverride(
  role: UserRole | null,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null =
    typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  env: { VITE_APP_ENV?: string } = import.meta.env as { VITE_APP_ENV?: string },
  target: { dispatchEvent: (e: Event) => boolean } | null = typeof window !== 'undefined' ? window : null,
): void {
  if (!isDemoBuild(env) || !storage) return
  if (!role) storage.removeItem(DEMO_ROLE_STORAGE_KEY)
  else storage.setItem(DEMO_ROLE_STORAGE_KEY, role)
  target?.dispatchEvent(new Event(DEMO_ROLE_EVENT))
}

export function effectiveDemoRole(
  membershipRole: UserRole,
  storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  env: { VITE_APP_ENV?: string } = import.meta.env as { VITE_APP_ENV?: string },
): UserRole {
  return readDemoRoleOverride(storage, env) ?? membershipRole
}
