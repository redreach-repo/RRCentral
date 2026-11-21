import type { ModuleManifest } from '../registry'
import type { ExtensionModule, ExtensionStrings } from './types'

/**
 * Sidebar groups: the core groups, with the items of modules that set
 * `attachTo` added to that group, then one group per other module.
 * An attached item with a `section` goes after the last link of that section
 * (else at the end), and keeps its module's switch as its own `flag`.
 * An `attachTo` naming no core group gets a group of its own.
 */
export function mergeExtensionNav(core: ModuleManifest[], exts: ExtensionModule[]): ModuleManifest[] {
  const ids = new Set(core.map((m) => m.id))
  const attached = new Map<string, ModuleManifest['items']>()
  const first = new Map<string, ModuleManifest['items']>()
  const own: ModuleManifest[] = []
  for (const ext of exts) {
    if (ext.attachTo && ids.has(ext.attachTo)) {
      const items = ext.manifest.items.map((item) =>
        item.flag || !ext.manifest.flag ? item : { ...item, flag: ext.manifest.flag },
      )
      const into = ext.attachFirst ? first : attached
      into.set(ext.attachTo, [...(into.get(ext.attachTo) || []), ...items])
    } else {
      own.push(ext.manifest)
    }
  }
  return [
    ...core.map((m) => {
      const extra = attached.get(m.id) || []
      const top = first.get(m.id) || []
      if (!extra.length && !top.length) return m
      const items = [...top, ...m.items]
      for (const item of extra) {
        let at = -1
        if (item.section) items.forEach((it, i) => (it.section === item.section ? (at = i) : undefined))
        if (at === -1) items.push(item)
        else items.splice(at + 1, 0, item)
      }
      return { ...m, items }
    }),
    ...own,
  ]
}

/** Sort by folder path so the sidebar order is stable, and refuse clashes. */
export function collectExtensions(found: Record<string, { default: ExtensionModule }>): ExtensionModule[] {
  const mods = Object.keys(found)
    .sort()
    .map((key) => found[key].default)
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const mod of mods) {
    if (ids.has(mod.manifest.id)) throw new Error(`Duplicate extension module id: ${mod.manifest.id}`)
    ids.add(mod.manifest.id)
    for (const route of mod.routes) {
      const path = route.path.replace(/^\/+/, '')
      if (paths.has(path)) throw new Error(`Duplicate extension route: ${path}`)
      paths.add(path)
    }
  }
  return mods
}

/** Merge every module's strings; a key defined twice is a bug, so refuse it. */
export function mergeExtensionStrings(found: Record<string, { default: ExtensionStrings }>): ExtensionStrings {
  const out: ExtensionStrings = { en: {}, ar: {} }
  for (const key of Object.keys(found).sort()) {
    const s = found[key].default
    for (const locale of ['en', 'ar'] as const) {
      for (const [k, v] of Object.entries(s[locale] || {})) {
        if (k in out[locale]) throw new Error(`Duplicate extension string ${locale}:${k}`)
        out[locale][k] = v
      }
    }
  }
  return out
}
