import { describe, expect, it } from 'vitest'
import { applyWarehouseDelta, qtyForWarehouse } from './warehouseStock'

describe('warehouseStockStore helpers', () => {
  it('lists qty after delta', () => {
    const rows = applyWarehouseDelta([], 'wh1', 'SKU-1', 5)
    expect(qtyForWarehouse(rows, 'wh1', 'SKU-1')).toBe(5)
  })
})
