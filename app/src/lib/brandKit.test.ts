import { describe, expect, it } from 'vitest'
import {
  applyBrandCssVars,
  brandAssetUrl,
  brandKitDraftProblem,
  brandKitToDraft,
  BRAND_PRESETS,
  coerceBrandKit,
  contrastRatio,
  densityScale,
  draftToBrandKitPatch,
  fontStack,
  isHexColor,
  normalizeBrandFonts,
  normalizeHexColor,
  REDREACH_DEFAULT_BRAND,
} from './brandKit'

describe('brandKit', () => {
  it('seeds Red Reach brand colors and default fonts', () => {
    expect(REDREACH_DEFAULT_BRAND.primary_color).toBe('#C8321A')
    expect(REDREACH_DEFAULT_BRAND.logo_horizontal_path).toContain('redreach-middle-east-fze.png')
    expect(REDREACH_DEFAULT_BRAND.fonts).toEqual({
      heading: 'dm_sans',
      body: 'dm_sans',
      density: 'comfortable',
    })
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

describe('fonts + density', () => {
  it('normalizes empty / unknown fonts jsonb', () => {
    expect(normalizeBrandFonts({})).toEqual({
      heading: 'dm_sans',
      body: 'dm_sans',
      density: 'comfortable',
    })
    expect(normalizeBrandFonts({ heading: 'source_serif', body: 'nope', density: 'spacious' })).toEqual({
      heading: 'source_serif',
      body: 'dm_sans',
      density: 'spacious',
    })
  })

  it('maps font stacks and density scales', () => {
    expect(fontStack('source_serif')).toContain('Source Serif 4')
    expect(densityScale('compact')).toBe('0.88')
    expect(densityScale('spacious')).toBe('1.12')
  })

  it('applies CSS vars including fonts and density', () => {
    const props: Record<string, string> = {}
    const root = {
      style: {
        setProperty: (k: string, v: string) => {
          props[k] = v
        },
      },
      dataset: {} as Record<string, string>,
    }
    applyBrandCssVars(
      coerceBrandKit({
        ...REDREACH_DEFAULT_BRAND,
        fonts: { heading: 'source_serif', body: 'ibm_plex_sans', density: 'compact' },
      }),
      root as unknown as HTMLElement,
    )
    expect(props['--font-heading']).toContain('Source Serif 4')
    expect(props['--font-body']).toContain('IBM Plex Sans')
    expect(props['--rr-density']).toBe('0.88')
    expect(root.dataset.density).toBe('compact')
  })
})

describe('draft validation', () => {
  it('rejects bad colours', () => {
    const draft = brandKitToDraft(REDREACH_DEFAULT_BRAND)
    draft.primary_color = 'red'
    expect(brandKitDraftProblem(draft)).toMatch(/hex/)
  })

  it('builds a patch including fonts from a valid draft', () => {
    const draft = brandKitToDraft(REDREACH_DEFAULT_BRAND)
    draft.heading_font = 'source_serif'
    draft.density = 'spacious'
    const patch = draftToBrandKitPatch(draft)
    expect(patch.primary_color).toBe('#C8321A')
    expect(patch.fonts).toEqual({
      heading: 'source_serif',
      body: 'dm_sans',
      density: 'spacious',
    })
  })
})

describe('contrastRatio', () => {
  it('scores black on white highly', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeGreaterThan(20)
  })
})

describe('BRAND_PRESETS', () => {
  it('includes highmast_red with fonts', () => {
    const p = BRAND_PRESETS.find((x) => x.key === 'highmast_red')
    expect(p?.kit.fonts?.heading).toBe('dm_sans')
  })
})
