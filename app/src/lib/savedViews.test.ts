import { describe, expect, it } from 'vitest'
import {
  accountsFiltersEqual,
  crmFiltersEqual,
  normalizeAccountsFilters,
  normalizeCrmFilters,
  normalizeQuotationsFilters,
  quotationsFiltersEqual,
} from './savedViews'

describe('savedViews helpers', () => {
  it('normalizes empty account filters', () => {
    expect(normalizeAccountsFilters({ q: '  ', type: 'all', owner: 'all' })).toEqual({})
  })

  it('keeps meaningful account filters', () => {
    expect(
      normalizeAccountsFilters({
        q: 'maxtherm',
        type: 'rr_threads_client',
        owner: 'none',
      }),
    ).toEqual({ q: 'maxtherm', type: 'rr_threads_client', owner: 'none' })
  })

  it('compares account filters', () => {
    expect(accountsFiltersEqual({}, { type: 'all' })).toBe(true)
    expect(accountsFiltersEqual({ q: 'a' }, { q: 'b' })).toBe(false)
  })

  it('normalizes CRM filters', () => {
    expect(
      normalizeCrmFilters({
        q: '  ',
        stage: 'All',
        owner: 'All',
        follow: 'Due',
        view: 'list',
      }),
    ).toEqual({ follow: 'Due' })
    expect(
      normalizeCrmFilters({
        q: 'acme',
        stage: 'Quoted',
        owner: 'Unassigned',
        follow: 'All',
        view: 'board',
      }),
    ).toEqual({ q: 'acme', stage: 'Quoted', owner: 'Unassigned', view: 'board' })
  })

  it('compares CRM filters', () => {
    expect(crmFiltersEqual({}, { follow: 'All' })).toBe(true)
    expect(crmFiltersEqual({ view: 'board' }, { view: 'list' })).toBe(false)
  })

  it('normalizes quotation filters', () => {
    expect(normalizeQuotationsFilters({ q: '', status: 'All' })).toEqual({})
    expect(normalizeQuotationsFilters({ q: 'RR-01', status: 'Draft' })).toEqual({
      q: 'RR-01',
      status: 'Draft',
    })
  })

  it('compares quotation filters', () => {
    expect(quotationsFiltersEqual({}, { status: 'All' })).toBe(true)
    expect(quotationsFiltersEqual({ status: 'Sent' }, { status: 'Draft' })).toBe(false)
  })
})
