import { visibleAppModules } from '../modules/nav'
import { navItemKey, navModuleKey, translateNavLabel } from './navI18n'
import type { UserRole } from './types'

export type CommandPaletteItem = {
  to: string
  label: string
  group: string
  keywords: string
}

/** Flatten module nav into palette rows the signed-in role can open. */
export function commandPaletteItems(
  userRole: UserRole,
  settings: Record<string, string | undefined> = {},
  translate: (key: string) => string = (key) => key,
  salesLocked = false,
  hiddenPages: readonly string[] = [],
): CommandPaletteItem[] {
  const rows: CommandPaletteItem[] = []
  for (const mod of visibleAppModules(userRole, settings, undefined, undefined, salesLocked, hiddenPages)) {
    const group = translateNavLabel(translate, navModuleKey(mod.id), mod.label)
    for (const item of mod.items) {
      const label = translateNavLabel(translate, navItemKey(item.to), item.label)
      rows.push({
        to: item.to,
        label,
        group,
        keywords: `${label} ${group} ${item.label} ${mod.label} ${item.to}`.toLowerCase(),
      })
    }
  }
  // About lives in the sidebar footer, not in a group, but stays searchable.
  const about = translateNavLabel(translate, navItemKey('/about-product'), 'About')
  const home = translateNavLabel(translate, navModuleKey('overview'), 'Home')
  rows.push({ to: '/about-product', label: about, group: home, keywords: `${about} ${home} about highmast /about-product`.toLowerCase() })
  return rows
}

export function filterCommandPaletteItems(
  items: CommandPaletteItem[],
  query: string,
): CommandPaletteItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => item.keywords.includes(q) || item.label.toLowerCase().includes(q))
}
