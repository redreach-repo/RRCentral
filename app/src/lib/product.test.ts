import { describe, expect, it } from 'vitest'
import { PRODUCT, productAssetUrls } from './product'

describe('PRODUCT', () => {
  it('exposes the HighMast product name and endorsement', () => {
    expect(PRODUCT.name).toBe('HighMast')
    expect(PRODUCT.shortName).toBe('HighMast')
    expect(PRODUCT.endorsement).toBe('by Red Reach')
    expect(PRODUCT.poweredBy).toBe('Powered by HighMast')
  })

  it('keeps the Master Spec brand colours', () => {
    expect(PRODUCT.colors.red).toBe('#C8321A')
    expect(PRODUCT.colors.orange).toBe('#E8872A')
  })

  it('builds Appendix C asset URLs under A-h-mast', () => {
    const assets = productAssetUrls('/RRCentral/')
    expect(assets.stackedReverse).toBe('/RRCentral/brand/highmast/A-h-mast/A_stacked_reverse.png')
    expect(assets.symbolReverse).toContain('A_symbol_reverse.svg')
    expect(assets.appIconFull).toContain('A_app-icon_full.png')
  })
})
