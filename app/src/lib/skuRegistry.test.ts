import { describe, expect, it } from 'vitest'
import { newDraftLine } from './lineItems'
import {
  assignLineItemSkus,
  descriptionCode,
  findCatalogMatch,
  nextSku,
  skuPrefix,
} from './skuRegistry'

describe('skuRegistry', () => {
  it('builds readable codes from the division and description', () => {
    expect(skuPrefix('01')).toBe('THR')
    expect(skuPrefix('6')).toBe('TRD')
    expect(skuPrefix('99')).toBe('RR')
    expect(descriptionCode('Dark Grey Shirt and Pants with Reflective Strips')).toBe('DGS')
    expect(descriptionCode('Light Blue Full-Sleeve Oxford Formal Shirt')).toBe('LBF')
    expect(descriptionCode('100% cotton')).toBe('C')
    expect(descriptionCode('—')).toBe('ITM')
  })

  it('numbers SKUs after the highest existing one', () => {
    expect(nextSku('THR', 'DGS', [])).toBe('THR-DGS-001')
    expect(nextSku('THR', 'DGS', ['THR-DGS-001', 'THR-DGS-007', 'THR-XYZ-020'])).toBe('THR-DGS-008')
  })

  it('matches catalog items by name, ignoring case, punctuation and the "SKU — name" prefix', () => {
    const catalog = [{ sku: 'COR-004-GB', name: 'Coverall', fabric: 'GB' }]
    expect(findCatalogMatch('coverall', catalog)?.sku).toBe('COR-004-GB')
    expect(findCatalogMatch('COR-004-GB — Coverall (GB)', catalog)?.sku).toBe('COR-004-GB')
    expect(findCatalogMatch('Coverall jacket', catalog)).toBeNull()
  })

  it('reuses catalog SKUs, keeps existing SKUs, and creates one product per new item', () => {
    const catalog = [{ sku: 'THR-DGS-001', name: 'Dark Grey Shirt', fabric: '' }]
    const { items, newProducts } = assignLineItemSkus(
      [
        newDraftLine({ description: 'Dark grey shirt', qty: 10, unit_price: 50 }),
        newDraftLine({ description: 'Sky Blue Shirt and Pants', qty: 50, unit_price: 105, unit_cost: 70 }),
        newDraftLine({ description: 'Sky blue shirt and pants', qty: 5, unit_price: 105 }),
        newDraftLine({ description: 'Polo', sku: 'CUSTOM-1', qty: 1, unit_price: 1 }),
        newDraftLine({ description: '   ', qty: 0, unit_price: 0 }),
      ],
      '01',
      catalog,
      'quotation Q-1',
    )
    expect(items.map((i) => i.sku)).toEqual(['THR-DGS-001', 'THR-SBS-001', 'THR-SBS-001', 'CUSTOM-1', ''])
    expect(newProducts).toEqual([
      {
        sku: 'THR-SBS-001',
        name: 'Sky Blue Shirt and Pants',
        division_code: '01',
        unit_price: 105,
        unit_cost: 70,
        moq: 50,
        unit: 'pcs',
        active: true,
        track_sizes: false,
        notes: 'Added automatically from quotation Q-1',
      },
    ])
  })

  it('gives different items with the same initials distinct numbers', () => {
    const { items } = assignLineItemSkus(
      [
        newDraftLine({ description: 'Dark Grey Shirt', qty: 1, unit_price: 1 }),
        newDraftLine({ description: 'Deep Green Scarf', qty: 1, unit_price: 1 }),
      ],
      '01',
      [],
    )
    expect(items.map((i) => i.sku)).toEqual(['THR-DGS-001', 'THR-DGS-002'])
  })
})
