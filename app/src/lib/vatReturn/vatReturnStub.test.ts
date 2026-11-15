import { describe, expect, it } from 'vitest'
import { buildVatReturnBoxes, vatPeriodLabel, vatReturnCsv } from './vatReturnStub'

describe('vatReturnStub', () => {
  it('builds boxes and CSV disclaimer', () => {
    const boxes = buildVatReturnBoxes({
      supplies: 1000,
      outputVat: 50,
      purchases: 200,
      inputVat: 10,
      netVat: 40,
      zeroRatedSupplies: 100,
      adjustments: 2,
      glVatPayable: 42,
    })
    expect(boxes.find((b) => b.box === '2a')?.amount).toBe(100)
    expect(boxes.find((b) => b.box === '9')?.amount).toBe(42)
    expect(boxes.find((b) => b.box === 'GL')?.amount).toBe(42)
    expect(vatReturnCsv('2026-Q4', boxes)).toMatch(/Unverified/)
    expect(vatReturnCsv('2026-Q4', boxes)).toMatch(/COMPLIANCE_NOTES/)
  })

  it('formats period labels', () => {
    expect(vatPeriodLabel('2026-11-15T00:00:00Z')).toBe('2026-Q4')
  })
})
