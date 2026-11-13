import { describe, expect, it } from 'vitest'
import { brandAssetUrl, REDREACH_DEFAULT_BRAND } from './brandKit'

describe('brandKit', () => {
  it('seeds Red Reach brand colors', () => {
    expect(REDREACH_DEFAULT_BRAND.primary_color).toBe('#C8321A')
    expect(REDREACH_DEFAULT_BRAND.logo_horizontal_path).toContain('redreach-middle-east-fze.png')
  })

  it('resolves relative brand paths against base URL', () => {
    const url = brandAssetUrl('brand/redreach/mark/redreach-mark-square.jpg')
    expect(url).toContain('brand/redreach/mark/redreach-mark-square.jpg')
  })

  it('passes through absolute URLs', () => {
    expect(brandAssetUrl('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png')
  })
})
