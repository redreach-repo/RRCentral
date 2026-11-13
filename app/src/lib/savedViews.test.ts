import { describe, expect, it } from 'vitest'
import { accountsFiltersEqual, normalizeAccountsFilters } from './savedViews'

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
})
