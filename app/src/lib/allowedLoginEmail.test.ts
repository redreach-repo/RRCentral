import { describe, expect, it } from 'vitest'
import {
  isAllowedLoginEmail,
  loginEmailDomainError,
  normalizeEmail,
} from './allowedLoginEmail'

describe('allowedLoginEmail', () => {
  it('allows redreach.ae emails only', () => {
    expect(isAllowedLoginEmail('alfred@redreach.ae')).toBe(true)
    expect(isAllowedLoginEmail(' Alfred@RedReach.AE ')).toBe(true)
    expect(isAllowedLoginEmail('alfredsv@gmail.com')).toBe(false)
    expect(isAllowedLoginEmail('redreachdxb@gmail.com')).toBe(false)
    expect(isAllowedLoginEmail('someone@yahoo.com')).toBe(false)
    expect(isAllowedLoginEmail('not-an-email')).toBe(false)
  })

  it('normalizes and explains rejection', () => {
    expect(normalizeEmail(' Jacob@RedReach.AE ')).toBe('jacob@redreach.ae')
    expect(loginEmailDomainError('me@gmail.com')).toMatch(/gmail\.com/i)
    expect(loginEmailDomainError('me@gmail.com')).toMatch(/redreach\.ae/)
  })
})
