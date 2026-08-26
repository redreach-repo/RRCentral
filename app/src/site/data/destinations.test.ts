import { describe, expect, it } from 'vitest'
import { WANDER_BUCKET, WANDER_PLACES, WANDER_REGIONS, wanderRegionBySlug } from './destinations'

describe('wander destinations', () => {
  it('keeps three regions with named places and two facts each', () => {
    expect(WANDER_REGIONS.map((r) => r.slug)).toEqual(['philippines', 'kerala', 'himalaya'])
    expect(WANDER_PLACES.length).toBeGreaterThanOrEqual(10)
    expect(WANDER_BUCKET.every((p) => p.image)).toBe(true)
    expect(wanderRegionBySlug('kerala')?.name).toBe('Kerala')
    expect(wanderRegionBySlug('missing')).toBeUndefined()
  })
})
