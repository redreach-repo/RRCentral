import { describe, expect, it } from 'vitest'
import { parseCallNotesForm } from './callNotes'

describe('parseCallNotesForm', () => {
  it('rejects blank notes', () => {
    const r = parseCallNotesForm({ notes: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/call notes/i)
  })

  it('trims notes', () => {
    const r = parseCallNotesForm({ notes: '  Need portal login  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.notes).toBe('Need portal login')
  })
})
