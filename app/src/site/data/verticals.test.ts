import { describe, expect, it } from 'vitest'
import { FEATURED_VERTICALS, VERTICALS, verticalBySlug } from './verticals'

describe('site verticals', () => {
  it('keeps every Red Reach vertical from the public site', () => {
    expect(VERTICALS.map((v) => v.brand)).toEqual([
      'RR Marketing',
      'RR Care',
      'RR Connect',
      'RR Wanders',
      'RR Threads',
      'RR Trading',
      'RR Upskilling',
    ])
    expect(new Set(VERTICALS.map((v) => v.slug)).size).toBe(7)
  })

  it('features Connect and Wanders on the home protocol', () => {
    expect(FEATURED_VERTICALS.map((v) => v.slug).sort()).toEqual(['connect', 'wanders'])
    expect(verticalBySlug('threads')?.code).toBe('01')
    expect(verticalBySlug('missing')).toBeUndefined()
  })
})
