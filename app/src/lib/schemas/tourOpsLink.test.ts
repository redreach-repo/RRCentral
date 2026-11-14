import { describe, expect, it } from 'vitest'
import { parseTourOpsLinkForm } from './tourOpsLink'

describe('parseTourOpsLinkForm', () => {
  it('rejects missing package/deal', () => {
    expect(
      parseTourOpsLinkForm({ packageId: '', departureId: 'd1', dealId: 'x', pax: 2 }).ok,
    ).toBe(false)
    expect(
      parseTourOpsLinkForm({ packageId: 'p', departureId: 'd1', dealId: '', pax: 2 }).ok,
    ).toBe(false)
  })

  it('rejects bad pax', () => {
    expect(
      parseTourOpsLinkForm({ packageId: 'p', departureId: 'd1', dealId: 'x', pax: 0 }).ok,
    ).toBe(false)
  })

  it('accepts a valid link', () => {
    const r = parseTourOpsLinkForm({
      packageId: ' p1 ',
      departureId: ' d1 ',
      dealId: ' deal ',
      pax: '3',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({ packageId: 'p1', departureId: 'd1', dealId: 'deal', pax: 3 })
  })
})
