import { describe, expect, it } from 'vitest'
import { parseInsightsCapacityForm } from './insightsCapacity'

describe('parseInsightsCapacityForm', () => {
  it('rejects zero and non-numeric', () => {
    expect(parseInsightsCapacityForm({ hours: 0 }).ok).toBe(false)
    expect(parseInsightsCapacityForm({ hours: 'abc' }).ok).toBe(false)
  })

  it('rejects over 2000', () => {
    const r = parseInsightsCapacityForm({ hours: 2001 })
    expect(r.ok).toBe(false)
  })

  it('accepts a normal capacity', () => {
    const r = parseInsightsCapacityForm({ hours: '100' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.hours).toBe(100)
  })
})
