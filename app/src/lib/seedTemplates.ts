import { ALL_SEED_PRODUCTS } from './seedCatalog'

export type SeedTemplateItem = {
  description: string
  qty: number
  unit_price: number
  remarks?: string
  sku?: string
}

export type SeedTemplate = {
  name: string
  division_code: string
  description: string
  items: SeedTemplateItem[]
}

function bySku(sku: string): SeedTemplateItem {
  const p = ALL_SEED_PRODUCTS.find((x) => x.sku === sku)
  return {
    sku,
    description: p ? `${p.sku} — ${p.name}${p.fabric ? ` (${p.fabric})` : ''}` : sku,
    qty: p?.moq || 50,
    unit_price: p?.unit_price || 0,
    remarks: p?.fabric ? `Fabric ${p.fabric}` : '',
  }
}

/** Ready-to-use quote templates built from catalogue SKUs. */
export const SEED_QUOTE_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Corporate set — Gabardine (GB)',
    division_code: '01',
    description: 'Oxford + Chinese collar + blazer ladder in Gabardine',
    items: [bySku('COR-003-OX-GB'), bySku('COR-003-CC-GB'), bySku('COR-004-GB')],
  },
  {
    name: 'Corporate set — Poly Viscose (PV)',
    division_code: '01',
    description: 'Oxford + Chinese collar + blazer ladder in Poly Viscose',
    items: [bySku('COR-003-OX-PV'), bySku('COR-003-CC-PV'), bySku('COR-004-PV')],
  },
  {
    name: 'Corporate set — Twill (TW)',
    division_code: '01',
    description: 'Oxford + Chinese collar + blazer ladder in Twill',
    items: [bySku('COR-003-OX-TW'), bySku('COR-003-CC-TW'), bySku('COR-004-TW')],
  },
  {
    name: 'Hospitality F&B set',
    division_code: '01',
    description: 'Chef coats, aprons, and dry-fit polo options',
    items: [
      bySku('HOS-004-CH-TW'),
      bySku('HOS-004-AH'),
      bySku('HOS-004-AF'),
      bySku('COR-002-DF-TW'),
      bySku('COR-002-MS-TW'),
    ],
  },
  {
    name: 'Industrial / site set',
    division_code: '01',
    description: 'Workwear tee + cargo and hi-vis options',
    items: [bySku('IND-006-DF-CR'), bySku('COR-001-DF-FS'), bySku('IND-002'), bySku('PRO-006')],
  },
]
