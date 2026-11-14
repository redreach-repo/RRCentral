import { describe, expect, it } from 'vitest'
import { parseAccountContactForm, parseAccountNoteForm } from './accountContact'

describe('parseAccountContactForm', () => {
  it('rejects blank name', () => {
    const r = parseAccountContactForm({
      name: '  ',
      role: '',
      email: '',
      phone: '',
      whatsapp: '',
      is_primary: false,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/name/i)
  })

  it('rejects invalid email', () => {
    const r = parseAccountContactForm({
      name: 'Alex',
      role: 'Ops',
      email: 'nope',
      phone: '',
      whatsapp: '',
      is_primary: true,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/email/i)
  })

  it('trims fields', () => {
    const r = parseAccountContactForm({
      name: '  Alex  ',
      role: '  Ops  ',
      email: ' alex@example.com ',
      phone: ' 1 ',
      whatsapp: ' 2 ',
      is_primary: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({
      name: 'Alex',
      role: 'Ops',
      email: 'alex@example.com',
      phone: '1',
      whatsapp: '2',
      is_primary: true,
    })
  })
})

describe('parseAccountNoteForm', () => {
  it('rejects blank body', () => {
    const r = parseAccountNoteForm({ kind: 'note', body: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/note/i)
  })

  it('rejects system kind', () => {
    const r = parseAccountNoteForm({ kind: 'system', body: 'hi' })
    expect(r.ok).toBe(false)
  })

  it('accepts call note', () => {
    const r = parseAccountNoteForm({ kind: 'call', body: '  Spoke with Alex  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({ kind: 'call', body: 'Spoke with Alex' })
  })
})
