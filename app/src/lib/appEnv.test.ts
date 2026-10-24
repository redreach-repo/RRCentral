import { describe, expect, it } from 'vitest'
import { handoffTarget, isStagingBuild, routerBasename, stagingHandoff } from './appEnv'

describe('staging copy', () => {
  it('knows which build it is', () => {
    expect(isStagingBuild({ VITE_APP_ENV: 'staging' })).toBe(true)
    expect(isStagingBuild({})).toBe(false)
  })

  it('routes under its own base', () => {
    expect(routerBasename('/RRCentral/')).toBe('/RRCentral')
    expect(routerBasename('/RRCentral/staging/')).toBe('/RRCentral/staging')
    expect(routerBasename('/')).toBe('/')
  })

  it('the live app hands staging deep links to the staging app', () => {
    const loc = { pathname: '/RRCentral/staging/accounts/123', search: '?tab=1', hash: '#x' }
    const to = stagingHandoff(loc, false)
    expect(to).toBe('/RRCentral/staging/app/?to=%2FRRCentral%2Fstaging%2Faccounts%2F123%3Ftab%3D1%23x')
    expect(stagingHandoff(loc, true)).toBeNull()
    expect(stagingHandoff({ pathname: '/RRCentral/accounts/1', search: '', hash: '' }, false)).toBeNull()
    expect(handoffTarget(to!.split('app/')[1])).toBe('/RRCentral/staging/accounts/123?tab=1#x')
  })

  it('only follows handoffs to staging addresses', () => {
    expect(handoffTarget('?to=%2FRRCentral%2Faccounts')).toBeNull()
    expect(handoffTarget('?to=https%3A%2F%2Fevil.example')).toBeNull()
    expect(handoffTarget('')).toBeNull()
  })
})
