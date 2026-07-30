import { WANDERS_DEFAULT_PACKAGE_CODES, WANDERS_PRODUCT_TYPES } from './wandersConfig'
import type { TourPackage } from './types'

export function buildDefaultTourPackages(): TourPackage[] {
  const now = new Date().toISOString()
  return WANDERS_DEFAULT_PACKAGE_CODES.map((p, i) => ({
    id: crypto.randomUUID(),
    code: p.code,
    name: p.name,
    destination: p.destination,
    product_type:
      p.code.includes('KER')
        ? WANDERS_PRODUCT_TYPES[0]
        : p.code.includes('PAL')
          ? WANDERS_PRODUCT_TYPES[3]
          : p.code.includes('BOR')
            ? WANDERS_PRODUCT_TYPES[4]
            : p.code.includes('CEB')
              ? WANDERS_PRODUCT_TYPES[2]
              : WANDERS_PRODUCT_TYPES[6],
    nights: p.nights,
    days: p.nights > 0 ? p.nights + 1 : 0,
    summary: `${p.name} — internal quotation template. Public site products are enquiry-only.`,
    inclusions: 'TBC per itinerary — hotels, transfers, activities as quoted',
    exclusions: 'Flights (unless separately arranged), visas, personal expenses, travel insurance',
    default_currency: 'TBC',
    guide_price: 0,
    active: true,
    notes: i === WANDERS_DEFAULT_PACKAGE_CODES.length - 1 ? 'Use for fully custom itineraries' : '',
    created_at: now,
    updated_at: now,
  }))
}
