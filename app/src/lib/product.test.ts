import { describe, expect, it } from 'vitest'
import { PRODUCT, productAssetUrls } from './product'

describe('PRODUCT', () => {
  it('exposes the HighMast product name and endorsement', () => {
    expect(PRODUCT.name).toBe('HighMast')
    expect(PRODUCT.shortName).toBe('HighMast')
    expect(PRODUCT.endorsement).toBe('by Red Reach')
  })

  it('keeps the Master Spec brand red', () => {
    expect(PRODUCT.colors.red).toBe('#C8321A')
    expect(PRODUCT.colors.orange).toBe('#E8872A')
  })

  it('builds brand asset URLs under public/brand/highmast', () => {
    const assets = productAssetUrls('/RRCentral/')
    expect(assets.symbol).toBe('/RRCentral/brand/highmast/highmast-symbol.png')
    expect(assets.stacked).toBe('/RRCentral/brand/highmast/highmast-stacked.png')
  })
})
