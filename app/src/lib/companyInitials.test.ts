import { describe, expect, it } from 'vitest'
import { companyInitials } from './companyInitials'

describe('companyInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(companyInitials('Red Reach')).toBe('RR')
    expect(companyInitials('mass allied trading llc')).toBe('MA')
  })
  it('uses two letters of a single word', () => {
    expect(companyInitials('Acme')).toBe('AC')
  })
  it('ignores punctuation and handles empty names', () => {
    expect(companyInitials('  & Co. ')).toBe('CO')
    expect(companyInitials('')).toBe('?')
  })
})
