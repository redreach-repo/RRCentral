import { describe, expect, it } from 'vitest'
import { applyDiscount, calcTotals, newDraftLine } from './lineItems'

describe('quotation discount', () => {
  it('applies percent then fixed amount before VAT', () => {
    const items = [
      newDraftLine({ description: 'Polo', qty: 10, unit_price: 100 }),
    ]
    // subtotal 1000; 10% = 100; +50 fixed = 150 discount; taxable 850; VAT 5% = 42.5; total 892.5
    const t = calcTotals(items, 0.05, { discountPercent: 10, discountAmount: 50 })
    expect(t.subtotal).toBe(1000)
    expect(t.discount).toBe(150)
    expect(t.taxable).toBe(850)
    expect(t.vat).toBe(42.5)
    expect(t.total).toBe(892.5)
  })

  it('caps discount at subtotal', () => {
    const { discount, taxable } = applyDiscount(100, { discountPercent: 50, discountAmount: 80 })
    expect(discount).toBe(100)
    expect(taxable).toBe(0)
  })

  it('leaves totals unchanged with no discount', () => {
    const items = [newDraftLine({ description: 'Item', qty: 2, unit_price: 50 })]
    const t = calcTotals(items, 0.05)
    expect(t.subtotal).toBe(100)
    expect(t.discount).toBe(0)
    expect(t.vat).toBe(5)
    expect(t.total).toBe(105)
    expect(t.cost).toBe(0)
    expect(t.profit).toBe(100)
  })

  it('computes cost and gross profit after discount', () => {
    const items = [
      newDraftLine({ description: 'Polo', qty: 10, unit_price: 100, unit_cost: 40 }),
    ]
    // sell 1000 − 10% = 900 taxable; cost 400; profit 500; margin 55.56%
    const t = calcTotals(items, 0.05, { discountPercent: 10 })
    expect(t.taxable).toBe(900)
    expect(t.cost).toBe(400)
    expect(t.profit).toBe(500)
    expect(t.marginPct).toBe(55.56)
  })

  it('adds VAT to 4535 then discounts that VAT so Maxtherm pays 4535', () => {
    const items = [
      newDraftLine({ description: 'Burgundy Polo T-shirt', qty: 75, unit_price: 35 }),
      newDraftLine({ description: 'Non woven Tote Bags', qty: 35, unit_price: 10 }),
      newDraftLine({ description: 'Hoodies', qty: 26, unit_price: 60 }),
    ]
    const t = calcTotals(items, 0.05, { offsetVat: true })
    expect(t.subtotal).toBe(4535)
    expect(t.vat).toBe(226.75)
    expect(t.discount).toBe(226.75)
    expect(t.total).toBe(4535)
  })
})
