import { describe, expect, it } from 'vitest'
import { defaultWarehouse, warehouseLabel } from './warehouses'

describe('warehouses', () => {
  it('picks default active warehouse', () => {
    const rows = [
      { id: '1', code: 'A', name: 'A', is_default: false, active: true },
      { id: '2', code: 'MAIN', name: 'Main', is_default: true, active: true },
    ]
    expect(defaultWarehouse(rows)?.code).toBe('MAIN')
    expect(warehouseLabel(rows[1])).toContain('MAIN')
  })
})
