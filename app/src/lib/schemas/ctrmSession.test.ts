import { describe, expect, it } from 'vitest'
import { parseCtrmSessionForm } from './ctrmSession'

const base = {
  kind: 'demo' as const,
  session_date: '2026-11-13',
  attendees: 'Sam',
  topics_covered: ['Platform overview'],
  topics_left: ['Trade capture'],
  recording_url: '',
  follow_up_due: null as string | null,
  notes: '',
}

describe('parseCtrmSessionForm', () => {
  it('requires a session date', () => {
    const r = parseCtrmSessionForm({ ...base, session_date: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/date/i)
  })

  it('rejects a topic in both lists', () => {
    const r = parseCtrmSessionForm({
      ...base,
      topics_covered: ['Trade capture'],
      topics_left: ['Trade capture'],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/both covered and left/i)
  })

  it('accepts a valid session', () => {
    const r = parseCtrmSessionForm(base)
    expect(r.ok).toBe(true)
  })
})
