/** M8a country pack helpers. Rule payloads stay Unverified until counsel. */

export type CountryPackRules = {
  taxIdLabel?: string
  vatRateHint?: number | null
  leaveTypes?: string[]
  payrollHints?: string[]
  verification?: string
}

export type CountryPack = {
  pack_key: string
  name: string
  country_code: string
  currency: string
  description: string
  version: string
  rules: CountryPackRules
}

export const BUILTIN_COUNTRY_PACKS: CountryPack[] = [
  {
    pack_key: 'ae',
    name: 'United Arab Emirates',
    country_code: 'AE',
    currency: 'AED',
    description: 'Starter UAE pack: VAT label + WPS hints. Unverified.',
    version: '0.1.0',
    rules: {
      taxIdLabel: 'TRN',
      vatRateHint: 0.05,
      leaveTypes: ['annual', 'sick', 'unpaid'],
      payrollHints: ['WPS SIF draft only — not bank-certified'],
      verification: 'Unverified',
    },
  },
  {
    pack_key: 'in',
    name: 'India',
    country_code: 'IN',
    currency: 'INR',
    description: 'Starter India pack: GSTIN placeholders. Unverified.',
    version: '0.1.0',
    rules: {
      taxIdLabel: 'GSTIN',
      vatRateHint: null,
      leaveTypes: ['earned', 'sick', 'casual'],
      payrollHints: ['PF/ESI/TDS not calculated in this pack'],
      verification: 'Unverified',
    },
  },
  {
    pack_key: 'ca',
    name: 'Canada',
    country_code: 'CA',
    currency: 'CAD',
    description: 'Starter Canada pack: GST/HST placeholders. Unverified.',
    version: '0.1.0',
    rules: {
      taxIdLabel: 'BN / GST-HST',
      vatRateHint: null,
      leaveTypes: ['vacation', 'sick', 'unpaid'],
      payrollHints: ['CPP/EI/provincial tax not calculated in this pack'],
      verification: 'Unverified',
    },
  },
]

export function countryPackByKey(key: string): CountryPack | undefined {
  return BUILTIN_COUNTRY_PACKS.find((p) => p.pack_key === key)
}

export function taxIdLabelForPack(pack: CountryPack | undefined, fallback = 'Tax ID'): string {
  return pack?.rules.taxIdLabel || fallback
}

export function isCountryPackVerified(pack: CountryPack | undefined): boolean {
  return (pack?.rules.verification || '').toLowerCase() === 'verified'
}
