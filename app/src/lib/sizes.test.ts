import { describe, expect, it } from 'vitest'
import { formatSizes, sumSizes, emptySizeBreakdown } from './sizes'
import { availableStock } from './inventory'

describe('sizes', () => {
  it('sums and formats size runs', () => {
    const sizes = { ...emptySizeBreakdown(), S: 2, M: 4, L: 1 }
    expect(sumSizes(sizes)).toBe(7)
    expect(formatSizes(sizes)).toBe('S:2 M:4 L:1')
  })
})

describe('availableStock', () => {
  it('subtracts reserved from on hand', () => {
    expect(availableStock({ stock_on_hand: 100, stock_reserved: 25 })).toBe(75)
    expect(availableStock({ stock_on_hand: 10, stock_reserved: 20 })).toBe(0)
  })
})
