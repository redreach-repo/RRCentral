import { describe, expect, it } from 'vitest'
import { canSetQuoteOutcome } from './quoteOutcome'

describe('canSetQuoteOutcome', () => {
  it('offers Outcome on an expired quote so it can be awarded late', () => {
    expect(canSetQuoteOutcome('Expired')).toBe(true)
  })
  it('offers Outcome on open and awarded quotes', () => {
    for (const s of ['Finalized', 'Sent', 'Accepted', 'Awarded']) expect(canSetQuoteOutcome(s)).toBe(true)
  })
  it('never on drafts, superseded or empty status', () => {
    for (const s of ['Draft', 'Superseded', '', null, undefined]) expect(canSetQuoteOutcome(s)).toBe(false)
  })
})
