import { describe, expect, it } from 'vitest'
import { browserAllowedHosts, DemoOutboundBlocked, installBrowserDemoGuard, isDemoBuild, requestHost, resetDemoGuardForTests } from './demoMode'
// @ts-expect-error plain .mjs build helper without types
import { demoTargetProblem } from '../../../scripts/demo-target.mjs'

describe('demo build guard', () => {
  it('detects demo builds only', () => {
    expect(isDemoBuild({ VITE_APP_ENV: 'demo' })).toBe(true)
    expect(isDemoBuild({ VITE_APP_ENV: 'staging' })).toBe(false)
    expect(isDemoBuild({})).toBe(false)
  })

  it('refuses a demo build aimed at the live project', () => {
    expect(demoTargetProblem({ VITE_APP_ENV: 'demo', VITE_SUPABASE_URL: 'https://pszjylxrpvlumldtptrr.supabase.co' })).toMatch(/LIVE/)
    expect(demoTargetProblem({ VITE_APP_ENV: 'demo', VITE_SUPABASE_URL: 'https://other.example.co' }, 'https://other.example.co/')).toMatch(/LIVE/)
    expect(demoTargetProblem({ VITE_APP_ENV: 'demo', VITE_SUPABASE_URL: 'https://demo123.supabase.co' })).toBeNull()
    expect(demoTargetProblem({ VITE_SUPABASE_URL: 'https://pszjylxrpvlumldtptrr.supabase.co' })).toBeNull()
  })

  it('hosts', () => {
    expect(requestHost('/rest/v1/x', 'https://app.example.com/a')).toBe('app.example.com')
    expect([...browserAllowedHosts('https://app.example.com', 'https://demo123.supabase.co')].sort()).toEqual([
      'app.example.com',
      'demo123.supabase.co',
    ])
  })

  it('blocks third parties in demo, lets own site and Supabase through', async () => {
    resetDemoGuardForTests()
    const calls: string[] = []
    const win = {
      location: { origin: 'https://app.example.com', href: 'https://app.example.com/app' },
      fetch: ((input: RequestInfo | URL) => {
        calls.push(String(input))
        return Promise.resolve(new Response('ok'))
      }) as typeof fetch,
    } as unknown as Pick<Window, 'fetch' | 'location'>
    expect(installBrowserDemoGuard('https://demo123.supabase.co', { VITE_APP_ENV: 'demo' }, win)).toBe(true)
    await expect(win.fetch('https://hooks.example.com/x')).rejects.toBeInstanceOf(DemoOutboundBlocked)
    await expect(win.fetch('https://api.stripe.com/v1')).rejects.toBeInstanceOf(DemoOutboundBlocked)
    await win.fetch('/assets/x.js')
    await win.fetch('https://demo123.supabase.co/rest/v1/crm')
    expect(calls).toEqual(['/assets/x.js', 'https://demo123.supabase.co/rest/v1/crm'])
  })

  it('outside demo it does nothing', () => {
    resetDemoGuardForTests()
    const f = (() => Promise.resolve(new Response())) as typeof fetch
    const win = { location: { origin: 'https://a', href: 'https://a/' }, fetch: f } as unknown as Pick<Window, 'fetch' | 'location'>
    expect(installBrowserDemoGuard('', { VITE_APP_ENV: 'production' }, win)).toBe(false)
    expect(win.fetch).toBe(f)
  })
})
