/**
 * Demo isolation in the browser (gap plan module 4, docs/modules/demo-isolation.md).
 * A demo build (VITE_APP_ENV=demo) shows a banner and refuses any fetch that
 * is not to this site or its own Supabase project, so nothing from the
 * browser (e.g. a webhook test or a third-party API) leaves a demo.
 */

export function isDemoBuild(env: { VITE_APP_ENV?: string } = import.meta.env as { VITE_APP_ENV?: string }): boolean {
  return String(env.VITE_APP_ENV || '').trim().toLowerCase() === 'demo'
}

export class DemoOutboundBlocked extends Error {
  readonly host: string
  constructor(host: string) {
    super(`Demo mode: a call to ${host} was blocked. Nothing is sent from the demo.`)
    this.host = host
    this.name = 'DemoOutboundBlocked'
  }
}

export function requestHost(input: RequestInfo | URL, base: string): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    return new URL(raw, base).host.toLowerCase()
  } catch {
    return ''
  }
}

export function browserAllowedHosts(origin: string, supabaseUrl: string): Set<string> {
  const out = new Set<string>()
  for (const u of [origin, supabaseUrl]) {
    try {
      if (u) out.add(new URL(u).host.toLowerCase())
    } catch {
      // ignore
    }
  }
  return out
}

let installed = false

/** Wrap window.fetch in a demo build. Returns whether the guard is active. */
export function installBrowserDemoGuard(
  supabaseUrl: string,
  env: { VITE_APP_ENV?: string } = import.meta.env as { VITE_APP_ENV?: string },
  win: Pick<Window, 'fetch' | 'location'> = window,
): boolean {
  if (!isDemoBuild(env)) return false
  if (installed) return true
  installed = true
  const allow = browserAllowedHosts(win.location.origin, supabaseUrl)
  const real = win.fetch.bind(win)
  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const host = requestHost(input, win.location.href)
    if (!allow.has(host)) return Promise.reject(new DemoOutboundBlocked(host || 'unknown'))
    return real(input, init)
  }) as typeof fetch
  return true
}

/** Test helper. */
export function resetDemoGuardForTests(): void {
  installed = false
}
