import { canHidePage, pagePath } from '../lib/hiddenPages'
import type { UserRole } from '../lib/types'
import { visibleAppModules } from './nav'

export type PageGroup = { id: string; label: string; pages: { path: string; label: string }[] }

/** Pages the role could see, grouped like the sidebar. Always shown pages are left out. */
export function pickablePageGroups(role: UserRole, settings: Record<string, string | undefined>): PageGroup[] {
  return visibleAppModules(role, settings)
    .map((group) => {
      const seen = new Set<string>()
      const pages: { path: string; label: string }[] = []
      for (const item of group.items) {
        const path = pagePath(item.to)
        if (!canHidePage(item.to) || seen.has(path)) continue
        seen.add(path)
        pages.push({ path, label: item.label })
      }
      return { id: group.id, label: group.label, pages }
    })
    .filter((g) => g.pages.length > 0)
}
