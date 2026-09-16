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
  })
})
