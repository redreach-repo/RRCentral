import { describe, expect, it } from 'vitest'
import { parseTimeEntryForm } from './timeEntry'

describe('parseTimeEntryForm', () => {
  it('rejects empty hours', () => {
    const r = parseTimeEntryForm({ date: '2026-11-13', hours: '', category: 'build', note: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/hours/i)
  })

  it('rejects hours over 24', () => {
    const r = parseTimeEntryForm({ date: '2026-11-13', hours: '25', category: 'build', note: '' })
    expect(r.ok).toBe(false)
  })

  it('accepts a valid entry and trims note', () => {
    const r = parseTimeEntryForm({
      date: '2026-11-13',
      hours: '1.5',
      category: 'support',
      note: '  standup  ',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({
      date: '2026-11-13',
      hours: 1.5,
      category: 'support',
      note: 'standup',
    })
  })
})
