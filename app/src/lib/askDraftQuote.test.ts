import { describe, expect, it } from 'vitest'
import { parseCrmAskAnswer } from './aiAssist'
import { resolveAskQuoteClient } from './askDraftQuote'
import type { CrmEntry } from './types'

describe('parseCrmAskAnswer', () => {
  it('reads a quotation proposal with unit_cost from structured JSON', () => {
    const parsed = parseCrmAskAnswer(
      JSON.stringify({
        reply: 'Ready to save a draft for Mass Allied.',
        quote_lookup_client: null,
        quote_draft: {
          client: 'Mass Allied',
          division_code: '01',
          description: 'Uniforms',
          notes: '',
          items: [{ description: 'Navy polo', qty: 50, unit_price: 48, unit_cost: 28 }],
        },
      }),
    )
    expect(parsed.reply).toContain('Mass Allied')
    expect(parsed.quoteLookupClient).toBeNull()
    expect(parsed.quoteDraft?.items).toEqual([
      { description: 'Navy polo', qty: 50, unit_price: 48, unit_cost: 28 },
    ])
  })

  it('defaults missing unit_cost to 0', () => {
    const parsed = parseCrmAskAnswer(
      JSON.stringify({
        reply: 'Draft ready.',
        quote_lookup_client: null,
        quote_draft: {
          client: 'Acme',
          division_code: '01',
          description: '',
          notes: '',
          items: [{ description: 'Polo', qty: 10, unit_price: 40 }],
        },
      }),
    )
    expect(parsed.quoteDraft?.items[0].unit_cost).toBe(0)
  })

  it('reads a quote lookup client without a draft', () => {
    const parsed = parseCrmAskAnswer(
      JSON.stringify({
        reply: 'Checking quotations for Mass Allied.',
        quote_lookup_client: 'Mass Allied',
        quote_draft: null,
      }),
    )
    expect(parsed.quoteLookupClient).toBe('Mass Allied')
    expect(parsed.quoteDraft).toBeNull()
  })

  it('drops incomplete proposals', () => {
    const parsed = parseCrmAskAnswer(
      JSON.stringify({
        reply: 'Need a price.',
        quote_lookup_client: null,
        quote_draft: {
          client: 'Acme',
          division_code: '01',
          description: '',
          notes: '',
          items: [{ description: 'Polo', qty: 0, unit_price: 10, unit_cost: 0 }],
        },
      }),
    )
    expect(parsed.quoteDraft).toBeNull()
  })
})

describe('resolveAskQuoteClient', () => {
  it('matches an existing CRM company name', () => {
    const entries = [
      { company_name: 'MASS ALLIED FREIGHTERS L.L.C' },
      { company_name: 'Other Co' },
    ] as CrmEntry[]
    expect(resolveAskQuoteClient('mass allied freighters l.l.c', entries)).toBe(
      'MASS ALLIED FREIGHTERS L.L.C',
    )
    expect(resolveAskQuoteClient('Brand New Client', entries)).toBe('Brand New Client')
  })
})
