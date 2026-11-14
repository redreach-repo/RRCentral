import { describe, expect, it } from 'vitest'
import { parseBuildBlockerNote } from './buildBlocker'

describe('parseBuildBlockerNote', () => {
  it('rejects blank note', () => {
    const r = parseBuildBlockerNote({ note: '  ' })
    expect(r.ok).toBe(false)
  })

  it('trims note', () => {
    const r = parseBuildBlockerNote({ note: '  Waiting on client logo  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.note).toBe('Waiting on client logo')
  })
})
