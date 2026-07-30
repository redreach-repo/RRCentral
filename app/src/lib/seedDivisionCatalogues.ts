import type { Product } from './types'

function product(
  id: string,
  sku: string,
  name: string,
  division: string,
  unit: string,
  notes: string,
): Product {
  return {
    id,
    sku,
    name,
    division_code: division,
    unit_price: 0,
    moq: 1,
    fabric: '',
    unit,
    active: true,
    notes,
    stock_on_hand: 0,
    stock_reserved: 0,
    reorder_level: 0,
    track_sizes: false,
    size_stock: null,
    updated_at: new Date().toISOString(),
  }
}

/** Editable Marketing service catalogue (prices left 0 — set per customer). */
export function buildMarketingCatalogue(): Product[] {
  return [
    product(
      'mkt-seo-ret',
      'MKT-SEO-RET',
      'SEO monthly retainer',
      '03',
      'month',
      'Scope, KPIs and fee editable per client',
    ),
    product(
      'mkt-soc-ret',
      'MKT-SOC-RET',
      'Social media management retainer',
      '03',
      'month',
      'Channels and deliverables editable per client',
    ),
    product(
      'mkt-ads-mgmt',
      'MKT-ADS-MGMT',
      'Paid ads management (media spend excluded)',
      '03',
      'month',
      'Ad spend billed separately unless listed',
    ),
    product(
      'mkt-content',
      'MKT-CONTENT',
      'Content package',
      '03',
      'package',
      'Deliverable count editable',
    ),
    product(
      'mkt-web',
      'MKT-WEB',
      'Website / landing project',
      '03',
      'project',
      'Milestones editable per client',
    ),
  ]
}

/** RR Connect VA services — manpower fulfilled by Konekt+ (Manila). */
export function buildConnectCatalogue(): Product[] {
  const note =
    'Manpower fulfilled by Konekt+ (Manila). RR Connect invoices the client for hours/services. Role, hours and rate editable per engagement.'
  return [
    product('con-va-gen', 'CON-VA-GEN', 'General virtual assistant hours', '04', 'hour', note),
    product('con-va-exec', 'CON-VA-EXEC', 'Executive assistant hours', '04', 'hour', note),
    product('con-va-cust', 'CON-VA-CUST', 'Customer support VA hours', '04', 'hour', note),
    product('con-va-ops', 'CON-VA-OPS', 'Operations / data entry VA hours', '04', 'hour', note),
    product(
      'con-ret-ft',
      'CON-RET-FT',
      'Full-time VA retainer (monthly)',
      '04',
      'month',
      note,
    ),
  ]
}

/** RR Trading — help customers get what they want (specs editable). */
export function buildTradingCatalogue(): Product[] {
  const note =
    'Spec, quantity and Incoterms editable per customer. RR Trading sources to requirement.'
  return [
    product('trd-src', 'TRD-SRC', 'Sourcing / find-what-you-need', '06', 'lot', note),
    product('trd-goods', 'TRD-GOODS', 'Traded goods (customer specification)', '06', 'unit', note),
    product('trd-log', 'TRD-LOG', 'Logistics coordination', '06', 'shipment', note),
    product('trd-fee', 'TRD-FEE', 'Trading / facilitation fee', '06', 'deal', note),
  ]
}

export const CONNECT_PARTNER = {
  name: 'Konekt+',
  location: 'Manila, Philippines',
  role: 'Provides VA manpower / fulfilment',
  billingNote:
    'RR Connect invoices clients for hours and services. Konekt+ supplies the manpower. Engagement details remain editable per client.',
}
