/**
 * RR Threads product catalogue with SKUs.
 *
 * Scheme (aligned with Premium Catalogue PDF):
 *   {CAT}-{NNN}           representative catalogue item (e.g. COR-001)
 *   {CAT}-{NNN}-{CODE}    sellable quoted variant (fabric / set)
 *
 * Categories: COR HOS MED IND SEC AVI PPE SFG PRO
 * Fabric codes on sellable sets: GB (Gabardine), PV (Poly Viscose), TW (Twill)
 */

export type SeedProduct = {
  sku: string
  name: string
  division_code: string
  unit_price: number
  moq: number
  fabric: string
  unit: string
  active: boolean
  notes: string
}

const DIV = '01'
const MOQ = 50

function cat(
  sku: string,
  name: string,
  opts: Partial<SeedProduct> = {},
): SeedProduct {
  return {
    sku,
    name,
    division_code: DIV,
    unit_price: opts.unit_price ?? 0,
    moq: opts.moq ?? MOQ,
    fabric: opts.fabric ?? '',
    unit: opts.unit ?? 'pcs',
    active: opts.active ?? true,
    notes: opts.notes ?? 'Colour, sizing and branding confirmed per quote.',
  }
}

/** 54 representative products from RR Threads Premium Catalogue PDF. */
export const CATALOGUE_PRODUCTS: SeedProduct[] = [
  // Corporate & Office
  cat('COR-001', 'Corporate T-Shirts'),
  cat('COR-002', 'Polo Shirts'),
  cat('COR-003', 'Formal Shirts'),
  cat('COR-004', 'Corporate Blazers'),
  cat('COR-005', 'Office Trousers & Skirts'),
  cat('COR-006', 'Custom Branded Shirts'),
  // Hospitality & Hotel
  cat('HOS-001', 'Front Desk Uniforms'),
  cat('HOS-002', 'F&B Staff Uniforms'),
  cat('HOS-003', 'Housekeeping Uniforms'),
  cat('HOS-004', 'Chef Coats & Aprons'),
  cat('HOS-005', 'Concierge Uniforms'),
  cat('HOS-006', 'Bellboy Uniforms'),
  // Healthcare & Medical
  cat('MED-001', 'Medical Scrubs'),
  cat('MED-002', 'Nurse Uniforms'),
  cat('MED-003', 'Lab Coats'),
  cat('MED-004', 'Patient Gowns'),
  cat('MED-005', 'Medical Caps & Masks'),
  cat('MED-006', 'Dental & Clinic Wear'),
  // Industrial & Workwear
  cat('IND-001', 'Industrial Coveralls'),
  cat('IND-002', 'Hi-Vis Reflective Jackets'),
  cat('IND-003', 'Industrial Work Trousers'),
  cat('IND-004', 'Boiler Suits'),
  cat('IND-005', 'Mechanic Overalls'),
  cat('IND-006', 'Cargo Pants'),
  // Security & Enforcement
  cat('SEC-001', 'Security Guard Uniforms'),
  cat('SEC-002', 'Traffic Marshal Jackets'),
  cat('SEC-003', 'Security Polo Shirts'),
  cat('SEC-004', 'Tactical Trousers'),
  cat('SEC-005', 'Security Boots'),
  cat('SEC-006', 'Caps & Berets'),
  // Aviation & Airline
  cat('AVI-001', 'Cabin Crew Uniforms'),
  cat('AVI-002', 'Ground Staff Uniforms'),
  cat('AVI-003', 'Pilot Shirts'),
  cat('AVI-004', 'Ramp Crew Coveralls'),
  cat('AVI-005', 'Hi-Vis Vests'),
  cat('AVI-006', 'Airport Operations Wear'),
  // PPE Collection
  cat('PPE-001', 'Hard Hats'),
  cat('PPE-002', 'Safety Helmets'),
  cat('PPE-003', 'Safety Glasses'),
  cat('PPE-004', 'Face Shields'),
  cat('PPE-005', 'Hearing Protection'),
  cat('PPE-006', 'Masks & Respirators'),
  // Safety Footwear & Gloves
  cat('SFG-001', 'Safety Boots'),
  cat('SFG-002', 'Anti-Slip Work Shoes'),
  cat('SFG-003', 'Safety Sandals'),
  cat('SFG-004', 'Leather Safety Gloves'),
  cat('SFG-005', 'Chemical-Resistant Gloves'),
  cat('SFG-006', 'Anti-Static Gloves'),
  // Protective Clothing
  cat('PRO-001', 'Hi-Vis Safety Jackets'),
  cat('PRO-002', 'Chemical-Resistant Suits'),
  cat('PRO-003', 'Fire-Retardant Coveralls'),
  cat('PRO-004', 'Disposable Coveralls'),
  cat('PRO-005', 'Rainwear'),
  cat('PRO-006', 'Reflective Vests'),
]

/**
 * Sellable SKUs derived from quotations already sent (fabric / set variants).
 * Prices are typical quoted unit prices (AED) from historical line items.
 */
export const QUOTED_SELLABLE_PRODUCTS: SeedProduct[] = [
  cat('COR-003-OX-GB', 'Oxford shirt with logo & trousers', {
    fabric: 'GB',
    unit_price: 125,
    notes: 'Shirt + trousers set · Gabardine. Logo embroidery. Was quoted as Oxford shirt & pants/trousers (GB).',
  }),
  cat('COR-003-OX-PV', 'Oxford shirt with logo & trousers', {
    fabric: 'PV',
    unit_price: 120,
    notes: 'Shirt + trousers set · Poly Viscose. Logo embroidery.',
  }),
  cat('COR-003-OX-TW', 'Oxford shirt with logo & trousers', {
    fabric: 'TW',
    unit_price: 115,
    notes: 'Shirt + trousers set · Twill. Logo embroidery.',
  }),
  cat('COR-003-CC-GB', 'Chinese collar shirt with logo & trousers', {
    fabric: 'GB',
    unit_price: 120,
    notes: 'Shirt + trousers set · Gabardine. Logo embroidery.',
  }),
  cat('COR-003-CC-PV', 'Chinese collar shirt with logo & trousers', {
    fabric: 'PV',
    unit_price: 115,
    notes: 'Shirt + trousers set · Poly Viscose. Logo embroidery.',
  }),
  cat('COR-003-CC-TW', 'Chinese collar shirt with logo & trousers', {
    fabric: 'TW',
    unit_price: 110,
    notes: 'Shirt + trousers set · Twill. Logo embroidery.',
  }),
  cat('COR-004-GB', 'Corporate blazer with logo', {
    fabric: 'GB',
    unit_price: 400,
    notes: 'Blazer with logo · Gabardine.',
  }),
  cat('COR-004-PV', 'Corporate blazer with logo', {
    fabric: 'PV',
    unit_price: 375,
    notes: 'Blazer with logo · Poly Viscose.',
  }),
  cat('COR-004-TW', 'Corporate blazer with logo', {
    fabric: 'TW',
    unit_price: 350,
    notes: 'Blazer with logo · Twill.',
  }),
  cat('COR-002-DF-TW', 'Dry-fit polo with logo & trousers', {
    fabric: 'TW',
    unit_price: 115,
    notes: 'Dry-fit polo t-shirt + trousers · Twill. Logo embroidery.',
  }),
  cat('COR-002-MS-TW', 'Mesh polo with logo & trousers', {
    fabric: 'TW',
    unit_price: 105,
    notes: 'Mesh polo t-shirt + trousers · Twill. Logo embroidery.',
  }),
  cat('COR-001-DF-FS', 'Dry-fit full-sleeve round-neck t-shirt with logo', {
    fabric: '',
    unit_price: 125,
    notes: 'Performance knit tee · full sleeve · logo.',
  }),
  cat('IND-006-DF-CR', 'Dry-fit full-sleeve tee with reflector & cargo pants', {
    fabric: 'TW',
    unit_price: 130,
    notes: 'Dry-fit full-sleeve round-neck tee with reflector + cargo pants (TW).',
  }),
  cat('HOS-004-CH-GB', 'Chef coat with 2 flags & logo + trousers', {
    fabric: 'GB',
    unit_price: 165,
    notes: 'Chef coat (2 flags + logo) + trousers · Gabardine.',
  }),
  cat('HOS-004-CH-PV', 'Chef coat with 2 flags & logo + trousers', {
    fabric: 'PV',
    unit_price: 160,
    notes: 'Chef coat (2 flags + logo) + trousers · Poly Viscose.',
  }),
  cat('HOS-004-CH-TW', 'Chef coat with 2 flags & logo + trousers', {
    fabric: 'TW',
    unit_price: 155,
    notes: 'Chef coat (2 flags + logo) + trousers · Twill.',
  }),
  cat('HOS-004-AH', 'Half apron with logo', {
    fabric: 'TW',
    unit_price: 25,
    notes: 'Half apron · logo embroidery/print.',
  }),
  cat('HOS-004-AF', 'Full apron with logo', {
    fabric: 'TW',
    unit_price: 35,
    notes: 'Full apron · logo embroidery/print.',
  }),
]

export const ALL_SEED_PRODUCTS: SeedProduct[] = [
  ...CATALOGUE_PRODUCTS,
  ...QUOTED_SELLABLE_PRODUCTS,
]

/** Map free-text quote line descriptions → preferred SKU (best effort). */
export const DESCRIPTION_TO_SKU: Array<{ match: RegExp; sku: string }> = [
  { match: /oxford.*(?:pants|trouser).*(?:gabardine|\(gb\))/i, sku: 'COR-003-OX-GB' },
  { match: /oxford.*(?:pants|trouser).*(?:poly\s*visc|\(pv\))/i, sku: 'COR-003-OX-PV' },
  { match: /oxford.*(?:pants|trouser).*(?:twill|twl|\(tw\))/i, sku: 'COR-003-OX-TW' },
  { match: /chinese\s*collar.*(?:pants|trouser).*(?:gabardine|\(gb\))/i, sku: 'COR-003-CC-GB' },
  { match: /chinese\s*collar.*(?:pants|trouser).*(?:poly\s*visc|\(pv\))/i, sku: 'COR-003-CC-PV' },
  { match: /chinese\s*collar.*(?:pants|trouser).*(?:twill|\(tw\))/i, sku: 'COR-003-CC-TW' },
  { match: /chinese\s*collar.*(?:pants|trouser)/i, sku: 'COR-003-CC-TW' },
  { match: /blazer.*(?:gabardine|\(gb\))/i, sku: 'COR-004-GB' },
  { match: /blazer.*(?:poly\s*visc|\(pv\))/i, sku: 'COR-004-PV' },
  { match: /blazer.*(?:twill|\(tw\))/i, sku: 'COR-004-TW' },
  { match: /dry\s*fit\s*polo.*(?:pants|trouser)/i, sku: 'COR-002-DF-TW' },
  { match: /mesh\s*polo.*(?:pants|trouser)/i, sku: 'COR-002-MS-TW' },
  { match: /dry\s*fit.*full\s*sleeve.*cargo/i, sku: 'IND-006-DF-CR' },
  { match: /dry\s*fit.*full\s*sleeve.*round/i, sku: 'COR-001-DF-FS' },
  { match: /chef\s*coat.*(?:gabardine|\(gb\))/i, sku: 'HOS-004-CH-GB' },
  { match: /chef\s*coat.*(?:poly\s*visc|\(pv\))/i, sku: 'HOS-004-CH-PV' },
  { match: /chef\s*coat.*(?:twill|\(tw\))/i, sku: 'HOS-004-CH-TW' },
  { match: /chef\s*coat/i, sku: 'HOS-004-CH-TW' },
  { match: /half\s*apron/i, sku: 'HOS-004-AH' },
  { match: /full\s*apron/i, sku: 'HOS-004-AF' },
]

export function resolveSkuFromDescription(description: string): string | null {
  const text = String(description || '').trim()
  if (!text) return null
  for (const row of DESCRIPTION_TO_SKU) {
    if (row.match.test(text)) return row.sku
  }
  return null
}
