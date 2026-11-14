import { APP_MODULES } from '../modules/nav'
import type { ModuleNavItem } from '../modules/registry'
import { shouldHidePipelineDetailNavItem } from './pipelineDetailNav'
import { roleAtLeast } from './permissions'
import type { UserRole } from './types'

export type CommandPaletteItem = {
  to: string
  label: string
  group: string
  keywords: string
}

function itemVisible(
  item: ModuleNavItem,
  userRole: UserRole,
  settings: Record<string, string | undefined>,
): boolean {
  if (userRole === 'staff' && !item.forStaff) return false
  if (item.roles) return item.roles.includes(userRole)
  if (item.minRole) return roleAtLeast(userRole, item.minRole)
  if (shouldHidePipelineDetailNavItem(item.to, settings, userRole)) return false
  return true
}

/** Flatten module nav into palette rows the signed-in role can open. */
export function commandPaletteItems(
  userRole: UserRole,
  settings: Record<string, string | undefined> = {},
): CommandPaletteItem[] {
  const rows: CommandPaletteItem[] = []
  for (const mod of APP_MODULES) {
    for (const item of mod.items) {
      if (!itemVisible(item, userRole, settings)) continue
      rows.push({
        to: item.to,
        label: item.label,
        group: mod.label,
        keywords: `${item.label} ${mod.label} ${item.to}`.toLowerCase(),
      })
    }
  }
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
