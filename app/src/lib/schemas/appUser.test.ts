import { describe, expect, it } from 'vitest'
import { parseAppUserForm } from './appUser'

describe('parseAppUserForm', () => {
  it('normalises email and requires password when creating (cloud)', () => {
    const bad = parseAppUserForm({
      email: '  Sara@RedReach.ae ',
      name: 'Sara',
      role: 'sales',
      active: true,
      password: '',
      editing: false,
      localMode: false,
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/initial password/)

    const ok = parseAppUserForm({
      email: '  Sara@RedReach.ae ',
      name: 'Sara',
      role: 'sales',
      active: true,
      password: 'secret123',
      editing: false,
      localMode: false,
    })
    expect(ok).toEqual({
      ok: true,
      data: {
        email: 'sara@redreach.ae',
        name: 'Sara',
        role: 'sales',
        active: true,
        password: 'secret123',
      },
    })
  })

  it('allows blank password when editing', () => {
    const result = parseAppUserForm({
      email: 'info@redreach.ae',
      name: 'Info',
      role: 'admin',
      active: true,
      password: '',
      editing: true,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects non-company email', () => {
    const result = parseAppUserForm({
      email: 'x@gmail.com',
      name: 'X',
      role: 'viewer',
      active: true,
      password: 'secret123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/@redreach\.ae/)
  })
})
