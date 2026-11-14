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

/** app_settings key: JSON map of module flag → boolean (false hides the module). */
export const MODULE_FLAGS_KEY = 'moduleFlags'

/**
 * Parse `moduleFlags` from settings. Missing keys default to enabled.
 * Example: `{"ops":false}` hides the Operations module.
 */
export function parseModuleFlags(settings: Record<string, string | undefined> = {}): Record<string, boolean> {
  const raw = settings[MODULE_FLAGS_KEY]
  if (!raw || !String(raw).trim()) return {}
  try {
    const parsed = JSON.parse(String(raw)) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[key] = value
      else if (value === 0 || value === '0' || value === 'no' || value === 'false') out[key] = false
      else if (value === 1 || value === '1' || value === 'yes' || value === 'true') out[key] = true
    }
    return out
  } catch {
    return {}
  }
}

export function modulesEnabled(
  modules: ModuleManifest[],
  flags: Record<string, boolean> = {},
): ModuleManifest[] {
  return modules.filter((m) => {
    if (!m.flag) return true
    return flags[m.flag] !== false
  })
}
