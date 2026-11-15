import { describe, expect, it } from 'vitest'
import { nextPoNumber, poReceiveRemaining, rollupPoStatus } from './purchasing'

describe('purchasing', () => {
  it('allocates PO numbers', () => {
    expect(nextPoNumber(['PO-2026-0001'], '2026-11-15')).toBe('PO-2026-0002')
  })

  it('rolls up receive status', () => {
    expect(rollupPoStatus([{ qty_ordered: 10, qty_received: 0 }])).toBe('ordered')
    expect(rollupPoStatus([{ qty_ordered: 10, qty_received: 4 }])).toBe('partial')
    expect(rollupPoStatus([{ qty_ordered: 10, qty_received: 10 }])).toBe('received')
    expect(poReceiveRemaining(10, 4)).toBe(6)
  })
})
