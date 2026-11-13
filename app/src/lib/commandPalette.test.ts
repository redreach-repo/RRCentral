import { describe, expect, it } from 'vitest'
import { commandPaletteItems, filterCommandPaletteItems } from './commandPalette'

describe('commandPaletteItems', () => {
  it('includes Pipeline and My Day for sales', () => {
    const items = commandPaletteItems('sales', {})
    const tos = items.map((i) => i.to)
    expect(tos).toContain('/deals')
    expect(tos).toContain('/crm')
    expect(tos).toContain('/guide')
  })

  it('hides sales-only destinations for staff when marked', () => {
    const sales = commandPaletteItems('sales', {}).map((i) => i.to)
    const staff = commandPaletteItems('staff', {}).map((i) => i.to)
    expect(sales).toContain('/quick-add')
    expect(staff).not.toContain('/quick-add')
  })
})

describe('filterCommandPaletteItems', () => {
  it('matches label and path fragments', () => {
    const items = commandPaletteItems('admin', {})
    const hits = filterCommandPaletteItems(items, 'pipe')
    expect(hits.some((h) => h.to === '/deals')).toBe(true)
    expect(filterCommandPaletteItems(items, 'zzzz-none')).toEqual([])
  })
})
