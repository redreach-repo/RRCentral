import { describe, expect, it } from 'vitest'
import { parseFirefliesMeetingInput } from './firefliesMeeting'

describe('parseFirefliesMeetingInput', () => {
  it('rejects blank input', () => {
    const r = parseFirefliesMeetingInput({ input: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Fireflies/i)
  })

  it('trims a link', () => {
    const r = parseFirefliesMeetingInput({
      input: '  https://app.fireflies.ai/view/abc  ',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.input).toBe('https://app.fireflies.ai/view/abc')
  })
})
