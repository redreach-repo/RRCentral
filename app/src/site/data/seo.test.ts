import { describe, expect, it } from 'vitest'
import { publicUrl } from './seo'
import { SITE } from './verticals'

describe('publicUrl', () => {
  it('builds canonical URLs on the live Pages origin', () => {
    expect(publicUrl('/')).toBe(`${SITE.publicOrigin}/`)
    expect(publicUrl('/marketing')).toBe(`${SITE.publicOrigin}/marketing`)
    expect(SITE.sqilah).toBe('https://sqilah.co')
  })
})
