import { describe, expect, it } from 'vitest'
import { parseCatalogProductForm, type CatalogProductFormInput } from './catalogProduct'

const base: CatalogProductFormInput = {
  name: 'Polo shirt',
  sku: 'POLO-1',
  division_code: '01',
  unit_price: 40,
  unit_cost: 20,
  moq: 12,
  fabric: 'PV',
  unit: 'pcs',
  active: true,
  notes: '',
  stock_on_hand: 10,
  reorder_level: 20,
  track_sizes: true,
}

describe('parseCatalogProductForm', () => {
  it('requires a name', () => {
    const r = parseCatalogProductForm({ ...base, name: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Name/i)
  })

  it('rejects negative price', () => {
    const r = parseCatalogProductForm({ ...base, unit_price: -1 })
    expect(r.ok).toBe(false)
  })

  it('accepts a valid product', () => {
    const r = parseCatalogProductForm(base)
    expect(r.ok).toBe(true)
  })
})
