import { describe, expect, it } from 'vitest'
import { parseLoginCredentials } from './login'

describe('parseLoginCredentials', () => {
  it('accepts a normalised @redreach.ae email and password', () => {
    const result = parseLoginCredentials({
      email: '  Alfred@RedReach.ae ',
      password: 'secret123',
    })
    expect(result).toEqual({
      ok: true,
      data: { email: 'alfred@redreach.ae', password: 'secret123' },
    })
  })

  it('rejects non-company domains', () => {
    const result = parseLoginCredentials({
      email: 'me@gmail.com',
      password: 'secret123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/@redreach\.ae/)
  })

  it('rejects short passwords outside local mode', () => {
    const result = parseLoginCredentials({
      email: 'info@redreach.ae',
      password: 'short',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/at least 8/)
  })

  it('allows short passwords in local mode', () => {
    const result = parseLoginCredentials({
      email: 'info@redreach.ae',
      password: 'x',
      localMode: true,
    })
    expect(result).toEqual({
      ok: true,
      data: { email: 'info@redreach.ae', password: 'x' },
    })
  })
})
