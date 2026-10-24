/**
 * Live or staging. The staging copy is the same app built with
 * VITE_APP_ENV=staging and VITE_BASE=/RRCentral/staging/, pointed at a
 * separate Supabase project, and published next to the live app.
 */

export const STAGING_BASE = '/RRCentral/staging/'

export function isStagingBuild(env: { VITE_APP_ENV?: string } = import.meta.env as { VITE_APP_ENV?: string }): boolean {
  return env.VITE_APP_ENV === 'staging'
}

/** Router basename from Vite's base, e.g. /RRCentral or /RRCentral/staging. */
export function routerBasename(baseUrl: string = import.meta.env.BASE_URL): string {
  return baseUrl.replace(/\/+$/, '') || '/'
}

/**
 * GitHub Pages serves the live app's 404 page for any unknown address,
 * including staging deep links such as /RRCentral/staging/accounts/123.
 * The live app sends those to the staging app, which then opens the page.
 */
export function stagingHandoff(loc: { pathname: string; search: string; hash: string }, staging: boolean): string | null {
  if (staging || !loc.pathname.startsWith(STAGING_BASE)) return null
  return `${STAGING_BASE}app/?to=${encodeURIComponent(loc.pathname + loc.search + loc.hash)}`
}

/** In the staging app: the page a handoff asked for, if it is a staging address. */
export function handoffTarget(search: string, base: string = STAGING_BASE): string | null {
  const to = new URLSearchParams(search).get('to')
  return to && to.startsWith(base) && !to.startsWith('//') ? to : null
}
