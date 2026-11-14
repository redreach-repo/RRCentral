/**
 * Demo isolation (gap plan module 4): a demo build (VITE_APP_ENV=demo) must
 * never point at the live Supabase project. Used by assert-client-supabase-key.mjs.
 */
export const LIVE_PROJECT_REFS = ['pszjylxrpvlumldtptrr']

/** Returns an error message, or null when the build target is fine. */
export function demoTargetProblem(env, extraLiveUrls = '') {
  if (String(env.VITE_APP_ENV || '').trim().toLowerCase() !== 'demo') return null
  const url = String(env.VITE_SUPABASE_URL || '').trim().toLowerCase()
  if (!url) return null
  const live = [
    ...LIVE_PROJECT_REFS.map((r) => `${r}.supabase.co`),
    ...String(extraLiveUrls || '')
      .split(',')
      .map((u) => u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean),
  ]
  if (live.some((host) => url.includes(host))) {
    return 'Demo build points at the LIVE Supabase project. Use the demo project URL and key (docs/modules/demo-isolation.md).'
  }
  return null
}
