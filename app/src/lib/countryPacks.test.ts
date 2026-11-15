import { describe, expect, it } from 'vitest'
import { BUILTIN_COUNTRY_PACKS, countryPackByKey, isCountryPackVerified, taxIdLabelForPack } from './countryPacks'

describe('countryPacks', () => {
  it('ships AE, IN, CA starters', () => {
    expect(BUILTIN_COUNTRY_PACKS.map((p) => p.pack_key).sort()).toEqual(['ae', 'ca', 'in'])
  })

  it('marks packs Unverified and exposes tax labels', () => {
    const ae = countryPackByKey('ae')
    expect(isCountryPackVerified(ae)).toBe(false)
    expect(taxIdLabelForPack(ae)).toBe('TRN')
    expect(taxIdLabelForPack(countryPackByKey('in'))).toBe('GSTIN')
    expect(taxIdLabelForPack(countryPackByKey('ca'))).toMatch(/GST/)
  })
})
