import { describe, expect, it } from 'vitest'
import { buildVatReturnBoxes, vatReturnCsv } from './vatReturnStub'

describe('vatReturnStub', () => {
  it('builds boxes and CSV disclaimer', () => {
    const boxes = buildVatReturnBoxes({
      supplies: 1000,
      outputVat: 50,
      purchases: 200,
      inputVat: 10,
      netVat: 40,
    })
    expect(boxes.find((b) => b.box === '9')?.amount).toBe(40)
    expect(vatReturnCsv('2026-Q4', boxes)).toMatch(/Unverified/)
  })
})
