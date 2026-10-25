import { describe, expect, it } from 'vitest'
import type { AppError } from './errorReporting'
import { can } from './permissions'
import { checkFunction, lastFunctionErrors, readPing, SYSTEM_FUNCTIONS, summarise } from './systemCheck'
import type { UserRole } from './types'

const fn = SYSTEM_FUNCTIONS[0]
const now = new Date('2026-10-25T08:00:00Z')

function err(page: string, created_at: string, kind: AppError['kind'] = 'function'): AppError {
  return { id: 1, created_at, kind, message: `${page} failed`, detail: '', page, user_email: '', user_agent: '', release: 'edge' }
}

describe('system check states', () => {
  it('is green when the ping answers, secrets are set and nothing failed lately', () => {
    const c = checkFunction(fn, readPing(200, { ok: true, ping: true, missing: [] }), err(fn.name, '2026-10-20T08:00:00Z'), now)
    expect(c.state).toBe('green')
    expect(c.lastError?.page).toBe(fn.name)
  })

  it('is red when not deployed, unreachable or a secret is missing', () => {
    expect(checkFunction(fn, readPing(404, {}), null, now).state).toBe('red')
    expect(checkFunction(fn, readPing(0, { error: 'Could not reach the function' }), null, now).reason).toBe('Could not reach the function')
    const missing = checkFunction(fn, readPing(200, { ping: true, missing: ['ANTHROPIC_API_KEY'] }), null, now)
    expect(missing.state).toBe('red')
    expect(missing.reason).toContain('ANTHROPIC_API_KEY')
    expect(checkFunction(fn, readPing(500, { error: 'boom' }), null, now).reason).toBe('Answered 500: boom')
  })

  it('is amber after a failure in the last day, or on an older deploy without the ping', () => {
    expect(checkFunction(fn, readPing(200, { ping: true }), err(fn.name, '2026-10-25T02:00:00Z'), now).state).toBe('amber')
    // Older code runs the real handler: it refuses or answers without ping: true.
    expect(checkFunction(fn, readPing(401, { error: 'Sign in' }), null, now).state).toBe('amber')
    expect(checkFunction(fn, readPing(200, { text: 'hi' }), null, now).state).toBe('amber')
  })

  it('keeps the newest function failure per function and ignores browser errors', () => {
    const last = lastFunctionErrors([
      err('ai-assist', '2026-10-24T01:00:00Z'),
      err('ai-assist', '2026-10-24T05:00:00Z'),
      err('daily-digest', '2026-10-23T01:00:00Z'),
      err('/app', '2026-10-24T09:00:00Z', 'browser'),
    ])
    expect(last.get('ai-assist')?.created_at).toBe('2026-10-24T05:00:00Z')
    expect(last.has('/app')).toBe(false)
    expect(last.size).toBe(2)
  })

  it('counts states and lists every deployable function once', () => {
    const checks = [
      checkFunction(fn, readPing(200, { ping: true }), null, now),
      checkFunction(fn, readPing(404, {}), null, now),
    ]
    expect(summarise(checks)).toEqual({ green: 1, amber: 0, red: 1 })
    const names = SYSTEM_FUNCTIONS.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).not.toContain('bootstrap-admin')
  })
})

describe('system check access per role', () => {
  const expected: Record<UserRole, boolean> = { admin: true, manager: false, sales: false, staff: false, viewer: false }
  for (const [role, allowed] of Object.entries(expected) as [UserRole, boolean][]) {
    it(`${role} ${allowed ? 'can' : 'cannot'} open System check`, () => {
      expect(can(role, 'system.check')).toBe(allowed)
    })
  }
})
