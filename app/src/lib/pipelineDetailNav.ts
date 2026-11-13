import type { UserRole } from './types'

/** Settings key: yes = hide /sales and /ctrm from nav for non-admins (URLs still work). */
export const HIDE_PIPELINE_DETAIL_NAV_KEY = 'hidePipelineDetailNav'

export const PIPELINE_DETAIL_NAV_PATHS = ['/sales', '/ctrm'] as const

/** True when the tenant flag is on (default off). */
export function hidePipelineDetailNavEnabled(settings: Record<string, string | undefined>): boolean {
  return String(settings[HIDE_PIPELINE_DETAIL_NAV_KEY] || '').toLowerCase() === 'yes'
}

/**
 * Soft-hide AI CRM / CTRM list nav for everyone except admins.
 * Bookmark URLs stay reachable; only sidebar items are filtered.
 */
export function shouldHidePipelineDetailNavItem(
  path: string,
  settings: Record<string, string | undefined>,
  userRole: UserRole,
): boolean {
  if (userRole === 'admin') return false
  if (!hidePipelineDetailNavEnabled(settings)) return false
  return (PIPELINE_DETAIL_NAV_PATHS as readonly string[]).includes(path)
}
