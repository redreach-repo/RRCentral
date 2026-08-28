import { describe, expect, it } from 'vitest'
import { addLine, cartTotals, itemCount, parseCart, removeLine, setLineQty } from './cart'

const tee = { productId: 'tt-chr-001', colorId: 'black', size: 'M', qty: 1 }

describe('Tee Tribe cart', () => {
  it('merges the same sku, colour and size', () => {
    const once = addLine([], tee)
    const twice = addLine(once, { ...tee, qty: 2 })
    expect(twice).toHaveLength(1)
    expect(twice[0].qty).toBe(3)
    expect(itemCount(twice)).toBe(3)
  })

  it('keeps a second line when colour or size changes', () => {
    const mixed = addLine(addLine([], tee), { ...tee, size: 'L' })
    expect(mixed).toHaveLength(2)
    expect(itemCount(mixed)).toBe(2)
  })

  it('prices from the catalog, not the client, and adds delivery under AED 150', () => {
    const totals = cartTotals([tee])
    expect(totals.subtotalFils).toBe(10900)
    expect(totals.shippingFils).toBe(1500)
    expect(totals.totalFils).toBe(12400)
    const free = cartTotals([
      tee,
      { productId: 'tt-sec-001', colorId: 'black', size: 'M', qty: 1 },
    ])
    expect(free.subtotalFils).toBe(21800)
    expect(free.shippingFils).toBe(0)
  })

  it('drops unknown products and round-trips storage', () => {
    const parsed = parseCart(JSON.stringify([tee, { productId: 'nope', colorId: 'black', size: 'M', qty: 1 }]))
    expect(parsed).toHaveLength(2)
    const totals = cartTotals(parsed)
    expect(totals.valid).toHaveLength(1)
    expect(totals.skipped).toHaveLength(1)
    const next = setLineQty([tee], 'tt-chr-001::black::M', 0)
    expect(next).toEqual([])
    expect(removeLine([tee], 'tt-chr-001::black::M')).toEqual([])
  })
})
