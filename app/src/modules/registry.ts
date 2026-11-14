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

/** Soft-hide toggles exposed on Settings → Module flags (must match module `flag` keys). */
export const SETTINGS_MODULE_FLAGS: { flag: string; labelKey: string }[] = [
  {
    flag: 'overview',
    labelKey: 'page.settings.moduleFlags.overview',
  },
  {
    flag: 'sales',
    labelKey: 'page.settings.moduleFlags.sales',
  },
  {
    flag: 'ops',
    labelKey: 'page.settings.moduleFlags.ops',
  },
  {
    flag: 'finance',
    labelKey: 'page.settings.moduleFlags.finance',
  },
  {
    flag: 'delivery',
    labelKey: 'page.settings.moduleFlags.delivery',
  },
  {
    flag: 'clients',
    labelKey: 'page.settings.moduleFlags.clients',
  },
]

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

/** True when the flag is missing or explicitly true (modules default on). */
export function isModuleFlagEnabled(flags: Record<string, boolean>, flag: string): boolean {
  return flags[flag] !== false
}

/**
 * Merge one flag into the map. Omits keys that are enabled (true) so the stored
 * JSON stays small — only disabled modules are listed.
 */
export function withModuleFlag(
  flags: Record<string, boolean>,
  flag: string,
  enabled: boolean,
): Record<string, boolean> {
  const next = { ...flags }
  if (enabled) delete next[flag]
  else next[flag] = false
  return next
}

/** Serialize for app_settings.moduleFlags (empty object → empty string). */
export function serializeModuleFlags(flags: Record<string, boolean>): string {
  const disabled = Object.fromEntries(Object.entries(flags).filter(([, v]) => v === false))
  if (Object.keys(disabled).length === 0) return ''
  return JSON.stringify(disabled)
}
