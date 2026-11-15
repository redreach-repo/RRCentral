import { describe, expect, it } from 'vitest'
import {
  brandAssetUrl,
  brandKitDraftProblem,
  brandKitToDraft,
  BRAND_PRESETS,
  contrastRatio,
  draftToBrandKitPatch,
  isHexColor,
  normalizeHexColor,
  REDREACH_DEFAULT_BRAND,
} from './brandKit'

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

describe('hex helpers', () => {
  it('validates and normalizes', () => {
    expect(isHexColor('#abc')).toBe(true)
    expect(normalizeHexColor('#abc')).toBe('#AABBCC')
    expect(normalizeHexColor('nope')).toBeNull()
  })
})

describe('draft validation', () => {
  it('rejects bad colours', () => {
    const draft = brandKitToDraft(REDREACH_DEFAULT_BRAND)
    draft.primary_color = 'red'
    expect(brandKitDraftProblem(draft)).toMatch(/hex/)
  })

  it('builds a patch from a valid draft', () => {
    const draft = brandKitToDraft(REDREACH_DEFAULT_BRAND)
    const patch = draftToBrandKitPatch(draft)
    expect(patch.primary_color).toBe('#C8321A')
  })
})

describe('contrastRatio', () => {
  it('scores black on white highly', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeGreaterThan(20)
  })
})

describe('BRAND_PRESETS', () => {
  it('includes highmast_red', () => {
    expect(BRAND_PRESETS.some((p) => p.key === 'highmast_red')).toBe(true)
  })
})
