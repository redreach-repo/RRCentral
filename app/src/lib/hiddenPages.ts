import type { UserRole } from './types'

/**
 * Pages an admin hid from one person (table public.user_hidden_pages,
 * migration 20261336090000_user_hidden_pages.sql). Settings, Users, edit a
 * person, "Pages this person sees".
 *
 * Hiding only removes links (sidebar, phone menu, Cmd+K) and blocks typed
 * addresses with the no-access page. What a person may read or change is still
 * decided by their role and the Sales lock in the database.
 */

/** Pages nobody can hide: Home, the guide and their own account settings. */
export const ALWAYS_SHOWN_PAGES: readonly string[] = ['/app', '/guide', '/settings']

/** Roles an admin can pick pages for. Admins always see every page. */
export const ROLES_WITH_PAGE_PICKER: readonly UserRole[] = ['manager', 'sales', 'staff', 'viewer']

const PATH_RE = /^\/[a-z0-9/_-]*$/

/** The page part of a sidebar link: '/settings#account' is '/settings'. */
export function pagePath(to: string): string {
  const base = (to.split('#')[0] || '').replace(/\/+$/, '')
  return base || '/'
}

/** Whether a sidebar link can be hidden (a plain page path, not one of the always shown). */
export function canHidePage(to: string): boolean {
  const path = pagePath(to)
  return PATH_RE.test(path) && path.length <= 80 && !ALWAYS_SHOWN_PAGES.includes(path)
}

/** Clean list from the database: valid, hideable, no duplicates. */
export function cleanHiddenPages(rows: readonly string[]): string[] {
  return [...new Set(rows.map(pagePath).filter(canHidePage))]
}

/** Whether this sidebar link is hidden for the person. */
export function isPageHidden(to: string, hidden: readonly string[]): boolean {
  if (hidden.length === 0 || !canHidePage(to)) return false
  return hidden.includes(pagePath(to))
}

/** Whether pages can be picked for this role. */
export function canPickPagesFor(role: UserRole | null | undefined): boolean {
  return Boolean(role) && ROLES_WITH_PAGE_PICKER.includes(role as UserRole)
}

/** The hidden pages after ticking or unticking a whole group. */
export function toggleGroup(hidden: readonly string[], groupPaths: readonly string[], show: boolean): string[] {
  const paths = groupPaths.map(pagePath).filter(canHidePage)
  if (show) return hidden.filter((p) => !paths.includes(p))
  return [...new Set([...hidden, ...paths])]
}
