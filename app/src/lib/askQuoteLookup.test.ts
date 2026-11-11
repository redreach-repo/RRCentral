import { describe, expect, it } from 'vitest'
import {
  pickQuotesForQuestion,
  quotationFactLines,
  quotationMatchesClient,
  toAskQuoteHit,
} from './askQuoteLookup'
import type { Quotation } from './types'

const quote = (partial: Partial<Quotation>): Quotation =>
  ({
    id: 'row-1',
    client: 'Mass Allied',
    vertical: 'Threads',
    reference_number: 'RR-01-12',
    date: '2026-11-01',
    description: 'Uniforms',
    amount: 2400,
    discount_percent: 0,
    discount_amount: 0,
    status: 'Sent',
    division_code: '01',
    base_reference: 'RR-01-12',
    revision: 0,
    quote_id: 'Q-abc',
    payment_terms: '',
    moq: '',
    notes: '',
    delivery_terms: '',
    outcome_reason: '',
    valid_until: null,
    currency: 'AED',
    created_at: '2026-11-01T10:00:00Z',
    ...partial,
  }) as Quotation

describe('quotationMatchesClient', () => {
  it('matches exact, partial and reverse partial names', () => {
    expect(quotationMatchesClient({ client: 'Mass Allied Freighters' }, 'mass allied')).toBe(true)
    expect(quotationMatchesClient({ client: 'Mass Allied' }, 'Mass Allied Freighters LLC')).toBe(true)
    expect(quotationMatchesClient({ client: 'Other Co' }, 'Mass Allied')).toBe(false)
    expect(quotationMatchesClient({ client: '' }, 'Mass')).toBe(false)
  })
})

describe('toAskQuoteHit', () => {
  it('builds a deep link and display label', () => {
    const hit = toAskQuoteHit(quote({}))
    expect(hit.path).toBe('/document/quote/row-1')
    expect(hit.label).toBe('RR-01-12')
    expect(hit.amountLabel).toMatch(/2,400/)
    expect(hit.date).toBe('2026-11-01')
  })

  it('shows DRAFT when there is no real reference', () => {
    const hit = toAskQuoteHit(quote({ reference_number: '', status: 'Draft', quote_id: 'Q-temp' }))
    expect(hit.label).toBe('DRAFT')
  })
})

describe('quotationFactLines', () => {
  it('formats compact fact lines for Claude', () => {
    const lines = quotationFactLines([quote({})], 5)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Mass Allied')
    expect(lines[0]).toContain('Sent')
    expect(lines[0]).toContain('RR-01-12')
  })
})

describe('pickQuotesForQuestion', () => {
  it('prefers quotes whose client appears in the question', () => {
    const rows = [
      quote({ id: '1', client: 'Mass Allied', quote_id: 'Q1' }),
      quote({ id: '2', client: 'Green Cement', quote_id: 'Q2', reference_number: 'RR-01-26008' }),
    ]
    const picked = pickQuotesForQuestion(rows, 'prices of uniforms sent to green cement', 3)
    expect(picked).toHaveLength(1)
    expect(picked[0].client).toBe('Green Cement')
  })

  it('falls back to newest quotes when nothing matches', () => {
    const rows = [
      quote({ id: '1', client: 'Acme', quote_id: 'Q1' }),
      quote({ id: '2', client: 'Beta', quote_id: 'Q2' }),
      quote({ id: '3', client: 'Gamma', quote_id: 'Q3' }),
      quote({ id: '4', client: 'Delta', quote_id: 'Q4' }),
    ]
    expect(pickQuotesForQuestion(rows, 'what is overdue?', 6)).toHaveLength(3)
  })
})
