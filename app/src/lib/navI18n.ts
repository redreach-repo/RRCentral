/**
 * Nav / shell i18n keys for APP_MODULES labels.
 * English copy stays on the manifests; catalogs supply EN + AR overrides.
 */

export function navModuleKey(moduleId: string): string {
  return `nav.module.${moduleId}`
}

/** `/delivery-settings` → nav.item.delivery-settings; `/settings#account` → nav.item.settings-account */
export function navItemKey(to: string): string {
  const slug = to.replace(/^\//, '').replace(/#/g, '-').replace(/\//g, '-') || 'home'
  return `nav.item.${slug}`
}

export function navSectionKey(section: string): string {
  return `nav.section.${section.trim().toLowerCase().replace(/\s+/g, '-')}`
}

/** Prefer catalog string; fall back to the manifest English label when missing. */
export function translateNavLabel(
  t: (key: string) => string,
  key: string,
  fallback: string,
): string {
  const value = t(key)
  return value === key ? fallback : value
}
