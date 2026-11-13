/**
 * RRCRM module registry (M1).
 * Nav, permissions hints, and feature flags derive from these manifests.
 * Sidebar groups live in `modules/nav.ts` (`APP_MODULES`); Layout only renders them.
 */
import type { ComponentType } from 'react'
import type { UserRole } from '../lib/types'

export type ModuleIcon = ComponentType<{ size?: number; strokeWidth?: number }>

export type ModuleNavItem = {
  to: string
  label: string
  icon: ModuleIcon
  end?: boolean
  section?: string
  minRole?: UserRole
  roles?: UserRole[]
  forStaff?: boolean
}

export type ModuleManifest = {
  id: string
  label: string
  icon: ModuleIcon
  /** Feature flag key; when false, module is hidden. Default true. */
  flag?: string
  items: ModuleNavItem[]
}

/** Stable Red Reach seed ids (must match supabase migration). */
export const REDREACH_TENANT_ID = 'a0000000-0000-4000-8000-000000000001'
export const REDREACH_COMPANY_ID = 'a0000000-0000-4000-8000-000000000002'

export function modulesEnabled(
  modules: ModuleManifest[],
  flags: Record<string, boolean> = {},
): ModuleManifest[] {
  return modules.filter((m) => {
    if (!m.flag) return true
    return flags[m.flag] !== false
  })
}
