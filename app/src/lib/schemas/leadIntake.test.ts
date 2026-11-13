import { describe, expect, it } from 'vitest'
import { parseLeadIntakeForm } from './leadIntake'

describe('parseLeadIntakeForm', () => {
  it('accepts fixed mode with optional owner and empty WhatsApp', () => {
    const r = parseLeadIntakeForm({
      mode: 'fixed',
      fixed: 'user-1',
      pool: [],
      whatsapp: '',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.mode).toBe('fixed')
    expect(r.data.fixed).toBe('user-1')
    expect(r.data.whatsappDigits).toBe('')
  })

  it('strips non-digits from WhatsApp', () => {
    const r = parseLeadIntakeForm({
      mode: 'fixed',
      fixed: '',
      pool: [],
      whatsapp: '+971 50 123 4567',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.whatsappDigits).toBe('971501234567')
  })

  it('rejects short WhatsApp when filled', () => {
    const r = parseLeadIntakeForm({
      mode: 'fixed',
      fixed: '',
      pool: [],
      whatsapp: '123',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/WhatsApp number/i)
  })

  it('requires a pool for round robin', () => {
    const r = parseLeadIntakeForm({
      mode: 'round_robin',
      fixed: '',
      pool: [],
      whatsapp: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/round robin/i)
  })

  it('accepts round robin with at least one owner', () => {
    const r = parseLeadIntakeForm({
      mode: 'round_robin',
      fixed: '',
      pool: ['a', 'b'],
      whatsapp: '971501234567',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.mode).toBe('round_robin')
    expect(r.data.pool).toEqual(['a', 'b'])
  })

  it('normalizes unknown mode to fixed', () => {
    const r = parseLeadIntakeForm({
      mode: 'something_else',
      fixed: '',
      pool: [],
      whatsapp: '',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.mode).toBe('fixed')
  })
})
