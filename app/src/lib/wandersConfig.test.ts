import { describe, expect, it } from 'vitest'
import {
  WANDERS_DIVISION_CODE,
  isWandersDivision,
  resolveWandersBaseCurrency,
  wandersMathCurrency,
} from './wandersConfig'
import { buildWandersTermsText } from './wandersTerms'
import { emptyWandersDeal, recomputeCommercial } from './wandersDeals'

describe('wandersConfig', () => {
  it('identifies Wanders division without affecting Threads', () => {
    expect(isWandersDivision(WANDERS_DIVISION_CODE)).toBe(true)
    expect(isWandersDivision('01')).toBe(false)
  })

  it('keeps base currency as TBC until confirmed', () => {
    expect(resolveWandersBaseCurrency(undefined)).toBe('TBC')
    expect(resolveWandersBaseCurrency('TBC')).toBe('TBC')
    expect(resolveWandersBaseCurrency('usd')).toBe('USD')
    expect(wandersMathCurrency('TBC')).toBeNull()
    expect(wandersMathCurrency('EUR')).toBe('EUR')
  })
})

describe('wandersTerms', () => {
  it('keeps governing law as TBC and does not insert UAE law', () => {
    const text = buildWandersTermsText({ governingLaw: 'TBC', disputeJurisdiction: 'TBC' })
    expect(text).toContain('Governing law: TBC')
    expect(text).not.toMatch(/Governing law: UAE/i)
    expect(text).toContain('does not issue or guarantee visas')
    expect(text.toLowerCase()).not.toContain('visa guaranteed')
  })

  it('marks flights clause not applicable when excluded', () => {
    const text = buildWandersTermsText({ includeFlightsClause: false })
    expect(text).toContain('Not applicable')
  })
})

describe('wandersDeals commercial', () => {
  it('computes deposit from configurable percent without inventing tax', () => {
    const deal = emptyWandersDeal({ quote_value: 1000, estimated_cost: 700, deposit_percent: 50 })
    const c = recomputeCommercial(deal)
    expect(c.deposit_amount).toBe(500)
    expect(c.balance_amount).toBe(500)
    expect(c.estimated_profit).toBe(300)
    expect(c.estimated_margin_pct).toBe(30)
  })
})
