import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETURN_KEY, isViewAsBrowser, minutesLeft, parseViewAs, readSaved } from './viewAs'

describe('parseViewAs', () => {
  it('reads the database answer', () => {
    expect(
      parseViewAs({ id: 'a', admin: 'Alfred', target_email: 'sara@redreach.ae', expires_at: '2026-11-28T10:00:00Z' }),
    ).toEqual({ id: 'a', admin: 'Alfred', targetEmail: 'sara@redreach.ae', expiresAt: '2026-11-28T10:00:00Z' })
  })

  it('is null when this is not a View as session', () => {
    expect(parseViewAs(null)).toBeNull()
    expect(parseViewAs('x')).toBeNull()
    expect(parseViewAs({ id: 'a' })).toBeNull()
  })
})

describe('minutesLeft', () => {
  const now = Date.parse('2026-11-28T10:00:00Z')
  it('rounds up and never goes below 0', () => {
    expect(minutesLeft('2026-11-28T10:30:00Z', now)).toBe(30)
    expect(minutesLeft('2026-11-28T10:00:30Z', now)).toBe(1)
    expect(minutesLeft('2026-11-28T09:59:00Z', now)).toBe(0)
    expect(minutesLeft('not a date', now)).toBe(0)
  })
})

describe('the saved admin sign in', () => {
  beforeEach(() => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('needs both tokens and the request id', () => {
    expect(readSaved(null)).toBeNull()
    expect(readSaved('{bad json')).toBeNull()
    expect(readSaved(JSON.stringify({ access_token: 'a', id: '1' }))).toBeNull()
    expect(readSaved(JSON.stringify({ access_token: 'a', refresh_token: 'r', id: '1' }))).toEqual({
      access_token: 'a',
      refresh_token: 'r',
      admin_email: '',
      id: '1',
    })
  })

  it('marks this browser as viewing only while it is saved', () => {
    expect(isViewAsBrowser()).toBe(false)
    localStorage.setItem(RETURN_KEY, JSON.stringify({ access_token: 'a', refresh_token: 'r', id: '1', admin_email: 'x' }))
    expect(isViewAsBrowser()).toBe(true)
  })
})
