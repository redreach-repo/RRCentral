import { describe, expect, it } from 'vitest'
import { applyWarehouseDelta, qtyForWarehouse } from './warehouseStock'

describe('warehouseStock', () => {
  it('applies deltas per warehouse/sku', () => {
    let rows = applyWarehouseDelta([], 'w1', 'SKU-1', 5)
    rows = applyWarehouseDelta(rows, 'w1', 'SKU-1', -2)
    expect(qtyForWarehouse(rows, 'w1', 'SKU-1')).toBe(3)
    expect(qtyForWarehouse(rows, 'w2', 'SKU-1')).toBe(0)
  })
})
