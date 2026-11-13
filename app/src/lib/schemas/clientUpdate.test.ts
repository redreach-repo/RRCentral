import { describe, expect, it } from 'vitest'
import { parseClientUpdateBody } from './clientUpdate'

describe('parseClientUpdateBody', () => {
  it('rejects blank body', () => {
    const r = parseClientUpdateBody({ body: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/weekly update/i)
  })

  it('trims body', () => {
    const r = parseClientUpdateBody({ body: '  Hello team  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.body).toBe('Hello team')
  })
})
