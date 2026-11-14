import { describe, expect, it } from 'vitest'
import { crmAccountCoverage, formatInventoryDigest, openDealInvariantSummary } from './pipelineInventory'

describe('crmAccountCoverage', () => {
  it('counts linked vs plan buckets', () => {
    const c = crmAccountCoverage(8, {
      unique: [{ crmId: '1', companyName: 'A', accountId: 'a', accountName: 'A', accountReference: 'R1' }],
      ambiguous: [{ crmId: '2', companyName: 'B', accountIds: ['a1', 'a2'] }],
      none: [{ crmId: '3', companyName: 'C' }],
    })
    expect(c).toMatchObject({
      total: 11,
      linked: 8,
      uniqueMatch: 1,
      ambiguous: 1,
      none: 1,
    })
    expect(c.linkedShare).toBeCloseTo(8 / 11)
  })

  it('treats empty inventory as fully linked', () => {
    expect(crmAccountCoverage(0, { unique: [], ambiguous: [], none: [] }).linkedShare).toBe(1)
  })
})

describe('openDealInvariantSummary', () => {
  it('reports healthy share from open deals minus gaps', () => {
    const s = openDealInvariantSummary([{ open: true }, { open: true }, { open: false }], [{ key: 'crm:1' }])
    expect(s).toEqual({ openDeals: 2, missingNextStep: 1, healthyShare: 0.5 })
  })
})

describe('formatInventoryDigest', () => {
  it('renders a short ops line', () => {
    const line = formatInventoryDigest(
      { total: 10, linked: 9, uniqueMatch: 1, ambiguous: 0, none: 0, linkedShare: 0.9 },
      { openDeals: 5, missingNextStep: 1, healthyShare: 0.8 },
    )
    expect(line).toMatch(/CRM linked 9\/10 \(90%\)/)
    expect(line).toMatch(/healthy 80% \(4\/5\)/)
  })
})
