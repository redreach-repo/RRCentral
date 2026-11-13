import { describe, expect, it } from 'vitest'
import { parseInventoryAdjust } from './inventoryAdjust'

describe('parseInventoryAdjust', () => {
  it('requires a non-zero delta', () => {
    const r = parseInventoryAdjust({ sku: 'SKU-1', delta: '0', reason: 'manual_adjust' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/non-zero/i)
  })

  it('rejects a blank reason', () => {
    const r = parseInventoryAdjust({ sku: 'SKU-1', delta: '2', reason: '  ' })
    expect(r.ok).toBe(false)
  })

  it('accepts a valid adjustment', () => {
    const r = parseInventoryAdjust({ sku: 'SKU-1', delta: '-3', reason: 'manual_adjust' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.qtyDelta).toBe(-3)
      expect(r.data.sku).toBe('SKU-1')
    }
  })
})
