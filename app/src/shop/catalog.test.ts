import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  COLORS,
  PRODUCTS,
  SIZES,
  filterProducts,
  productById,
  productBySlug,
  relatedProducts,
} from './catalog'
import { formatAed, shippingFilsFor } from './format'

describe('Tee Tribe catalog', () => {
  it('covers every promised collection with unique slugs and SKUs', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['christian', 'one-liners', 'minimalist', 'secular'])
    expect(new Set(PRODUCTS.map((p) => p.slug)).size).toBe(PRODUCTS.length)
    expect(new Set(PRODUCTS.map((p) => p.sku)).size).toBe(PRODUCTS.length)
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length)
    for (const category of CATEGORIES) {
      expect(PRODUCTS.filter((p) => p.category === category.id).length).toBeGreaterThanOrEqual(6)
    }
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(24)
    expect(SIZES).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
  })

  it('keeps every product buyable: priced in fils, real colours, lookup keys', () => {
    for (const product of PRODUCTS) {
      expect(product.priceFils).toBeGreaterThan(0)
      expect(product.priceFils % 100).toBe(0)
      expect(product.colorIds.length).toBeGreaterThan(0)
      expect(product.colorIds).toContain(product.defaultColor)
      for (const colorId of product.colorIds) {
        expect(COLORS[colorId]).toBeTruthy()
      }
      if (product.compareAtFils) {
        expect(product.compareAtFils).toBeGreaterThan(product.priceFils)
      }
      expect(productById(product.id)?.slug).toBe(product.slug)
      expect(productBySlug(product.slug)?.id).toBe(product.id)
    }
    expect(productBySlug('missing')).toBeUndefined()
  })

  it('filters by collection, sale, search and sort', () => {
    expect(filterProducts({ category: 'christian' }).every((p) => p.category === 'christian')).toBe(true)
    const sale = filterProducts({ sale: true })
    expect(sale.length).toBeGreaterThan(0)
    expect(sale.every((p) => p.compareAtFils || p.badges.includes('sale'))).toBe(true)
    const faith = filterProducts({ query: 'faith' })
    expect(faith.some((p) => p.slug === 'faith-over-fear')).toBe(true)
    const cheapFirst = filterProducts({ sort: 'price-asc' })
    expect(cheapFirst[0].priceFils).toBeLessThanOrEqual(cheapFirst[cheapFirst.length - 1].priceFils)
    const related = relatedProducts(productBySlug('dubai-nights')!)
    expect(related.some((p) => p.category === 'secular')).toBe(true)
    expect(related.every((p) => p.slug !== 'dubai-nights')).toBe(true)
  })

  it('formats AED and waives delivery over AED 150', () => {
    expect(formatAed(10900)).toBe('AED 109')
    expect(formatAed(8900)).toBe('AED 89')
    expect(shippingFilsFor(14900)).toBe(1500)
    expect(shippingFilsFor(15000)).toBe(0)
    expect(shippingFilsFor(0)).toBe(0)
  })
})
