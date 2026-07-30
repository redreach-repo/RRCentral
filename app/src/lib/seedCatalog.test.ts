import { describe, expect, it } from 'vitest'
import {
  ALL_SEED_PRODUCTS,
  CATALOGUE_PRODUCTS,
  QUOTED_SELLABLE_PRODUCTS,
  resolveSkuFromDescription,
} from './seedCatalog'

describe('seedCatalog', () => {
  it('has 54 catalogue SKUs with unique codes', () => {
    expect(CATALOGUE_PRODUCTS).toHaveLength(54)
    const skus = CATALOGUE_PRODUCTS.map((p) => p.sku)
    expect(new Set(skus).size).toBe(54)
  })

  it('quoted sellable SKUs are unique and extend catalogue prefixes', () => {
    const skus = QUOTED_SELLABLE_PRODUCTS.map((p) => p.sku)
    expect(new Set(skus).size).toBe(skus.length)
    for (const p of QUOTED_SELLABLE_PRODUCTS) {
      expect(p.sku).toMatch(/^(COR|HOS|IND)-/)
      expect(p.unit_price).toBeGreaterThan(0)
    }
  })

  it('all seed products have unique SKUs', () => {
    const skus = ALL_SEED_PRODUCTS.map((p) => p.sku)
    expect(new Set(skus).size).toBe(skus.length)
  })

  it('maps historical quote descriptions to SKUs', () => {
    expect(resolveSkuFromDescription('Oxford shirt with logo & Trouser (GB)')).toBe('COR-003-OX-GB')
    expect(resolveSkuFromDescription('Oxford shirt with logo & pants (Poly Viscous)')).toBe(
      'COR-003-OX-PV',
    )
    expect(resolveSkuFromDescription('Blazer with logo (Twill)')).toBe('COR-004-TW')
    expect(resolveSkuFromDescription('Half apron with logo')).toBe('HOS-004-AH')
    expect(
      resolveSkuFromDescription(
        'Dry Fit Full sleeve round neck tshirt with logo snd reflector and Cargo Pant (TW)',
      ),
    ).toBe('IND-006-DF-CR')
  })
})
