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

  it('features Marketing, Care and Wanders on the home editorial', () => {
    expect(FEATURED_VERTICALS.map((v) => v.slug).sort()).toEqual(['care', 'marketing', 'wanders'])
    expect(verticalBySlug('threads')?.heroAccent).toContain('programme')
    expect(VERTICALS.every((v) => v.verb && v.cta && v.seoTitle && v.seoDescription)).toBe(true)
    expect(verticalBySlug('missing')).toBeUndefined()
  })

  it('attaches photography from the original Red Reach site', () => {
    for (const vertical of VERTICALS) {
      expect(vertical.image.length).toBeGreaterThan(0)
      expect(vertical.icon).toMatch(/^icon-\d\.png$/)
    }
    expect(verticalBySlug('marketing')?.image).toBe('vertical-marketing.jpg')
    expect(verticalBySlug('wanders')?.gallery?.length).toBeGreaterThanOrEqual(6)
  })
})
