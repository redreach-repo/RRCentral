/** Resolved logo URL for GitHub Pages / local preview. */
export const DEFAULT_LOGO_URL = `${import.meta.env.BASE_URL}logo.png`

export function resolveLogoUrl(settingsLogoUrl?: string | null): string {
  const custom = String(settingsLogoUrl || '').trim()
  if (custom) return custom
  return DEFAULT_LOGO_URL
}
