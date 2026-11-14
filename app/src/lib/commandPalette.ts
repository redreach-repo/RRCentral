import { visibleAppModules } from '../modules/nav'
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
): CommandPaletteItem[] {
  const rows: CommandPaletteItem[] = []
  for (const mod of visibleAppModules(userRole, settings)) {
    for (const item of mod.items) {
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
