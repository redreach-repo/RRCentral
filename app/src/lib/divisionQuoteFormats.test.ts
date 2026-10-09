import { describe, expect, it } from 'vitest'
import {
  DIVISION_QUOTE_FORMATS,
  getDivisionQuoteFormat,
  resolveDivisionCode,
} from './divisionQuoteFormats'
import { CONNECT_PARTNER, buildConnectCatalogue, buildMarketingCatalogue } from './seedDivisionCatalogues'

describe('division quote formats', () => {
  it('gives Threads inventory-oriented columns', () => {
    const f = getDivisionQuoteFormat('01')
    expect(f.documentTitle).toBe('QUOTATION')
    expect(f.showInventorySku).toBe(true)
    expect(f.columns).toContain('sku')
    expect(f.columns).toContain('sizes')
  })

  it('gives Wanders a proposal title and trip-oriented layout', () => {
    const f = getDivisionQuoteFormat('02')
    expect(f.documentTitle).toContain('TRAVEL PROPOSAL')
    expect(f.showTripSummary).toBe(true)
    expect(f.showInventorySku).toBe(false)
  })

  it('gives Marketing an editable proposal format', () => {
    const f = getDivisionQuoteFormat('03')
    expect(f.documentTitle).toBe('MARKETING PROPOSAL')
    expect(f.formatLabel.toLowerCase()).toContain('marketing')
  })

  it('gives Connect hours billing with Konekt+ partner', () => {
    const f = getDivisionQuoteFormat('04')
    expect(f.showHoursBilling).toBe(true)
    expect(f.partnerName).toBe('Konekt+')
    expect(f.columns).toContain('hours')
    expect(CONNECT_PARTNER.location).toContain('Manila')
  })

  it('allows settings overrides without hard-coding customer deals', () => {
    const f = getDivisionQuoteFormat('03', {
      quoteFormat_03_documentTitle: 'CUSTOM CLIENT PROPOSAL',
      quoteFormat_03_closingNote: 'Custom close',
    })
    expect(f.documentTitle).toBe('CUSTOM CLIENT PROPOSAL')
    expect(f.closingNote).toBe('Custom close')
    expect(DIVISION_QUOTE_FORMATS['03'].documentTitle).toBe('MARKETING PROPOSAL')
  })

  it('seeds Marketing and Connect catalogues under correct divisions', () => {
    expect(buildMarketingCatalogue().every((p) => p.division_code === '03')).toBe(true)
    expect(buildConnectCatalogue().every((p) => p.division_code === '04')).toBe(true)
  })

  it('resolves invoice division from vertical brand (no division_code column)', () => {
    expect(resolveDivisionCode({ vertical: 'RR Marketing' })).toBe('03')
    expect(resolveDivisionCode({ vertical: 'RR Threads' })).toBe('01')
    expect(resolveDivisionCode({ referenceNumber: 'INV-03-26001' })).toBe('03')
    expect(resolveDivisionCode({ divisionCode: '04' })).toBe('04')
    expect(getDivisionQuoteFormat(resolveDivisionCode({ vertical: 'RR Marketing' })).showMoq).toBe(
      false,
    )
    expect(
      getDivisionQuoteFormat(resolveDivisionCode({ vertical: 'RR Marketing' })).showDelivery,
    ).toBe(false)
  })
})
