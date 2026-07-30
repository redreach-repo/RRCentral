/**
 * Division-specific quotation / proposal formats.
 * All copy and column sets are editable defaults — override via app_settings keys
 * `quoteFormat_XX_*` when present.
 */

export type DivisionCode = '01' | '02' | '03' | '04' | '05' | '06'

export type QuoteColumnId =
  | 'line'
  | 'sku'
  | 'description'
  | 'sizes'
  | 'qty'
  | 'unit'
  | 'unit_price'
  | 'amount'
  | 'vat'
  | 'total'
  | 'hours'
  | 'rate'
  | 'period'

export type DivisionQuoteFormat = {
  code: DivisionCode
  brand: string
  /** Customer-facing document title */
  documentTitle: string
  /** Short label shown in editor */
  formatLabel: string
  introEyebrow: string
  defaultDescriptionHint: string
  showMoq: boolean
  showDelivery: boolean
  showFabricHint: boolean
  showInventorySku: boolean
  showTripSummary: boolean
  showHoursBilling: boolean
  showPartnerFulfillment: boolean
  partnerName: string
  columns: QuoteColumnId[]
  sectionHeadings: {
    billTo: string
    scope: string
    lines: string
    commercial: string
    terms: string
  }
  defaultPaymentTerms: string
  defaultScopeNotes: string
  closingNote: string
}

export const DIVISION_QUOTE_FORMATS: Record<DivisionCode, DivisionQuoteFormat> = {
  '01': {
    code: '01',
    brand: 'RR Threads',
    documentTitle: 'QUOTATION',
    formatLabel: 'Uniforms / inventory quotation',
    introEyebrow: 'RR Threads · Uniforms & workwear',
    defaultDescriptionHint: 'Uniform supply — styles, fabrics, size runs and MOQ as listed',
    showMoq: true,
    showDelivery: true,
    showFabricHint: true,
    showInventorySku: true,
    showTripSummary: false,
    showHoursBilling: false,
    showPartnerFulfillment: false,
    partnerName: '',
    columns: ['line', 'sku', 'description', 'sizes', 'qty', 'unit_price', 'amount', 'vat', 'total'],
    sectionHeadings: {
      billTo: 'Bill to',
      scope: 'Order summary',
      lines: 'Uniform line items',
      commercial: 'Payment & delivery',
      terms: 'Notes / terms',
    },
    defaultPaymentTerms: 'Immediate upon delivery',
    defaultScopeNotes:
      'Unit prices are based on stated MOQ per style per colour. Size runs as specified. Subject to stock at time of order.',
    closingNote: 'Thanking you and looking forward to doing business with you.',
  },
  '02': {
    code: '02',
    brand: 'RR Wanders',
    documentTitle: 'TRAVEL PROPOSAL & QUOTATION',
    formatLabel: 'Travel proposal / itinerary quotation',
    introEyebrow: 'RR Wanders · Tours & travel',
    defaultDescriptionHint: 'Tour package / custom itinerary proposal',
    showMoq: false,
    showDelivery: false,
    showFabricHint: false,
    showInventorySku: false,
    showTripSummary: true,
    showHoursBilling: false,
    showPartnerFulfillment: false,
    partnerName: '',
    columns: ['line', 'description', 'qty', 'unit_price', 'amount', 'total'],
    sectionHeadings: {
      billTo: 'Prepared for',
      scope: 'Trip overview',
      lines: 'Package & services',
      commercial: 'Deposit, balance & payment',
      terms: 'RR Wanders terms',
    },
    defaultPaymentTerms: '50% deposit to confirm · balance per Confirmation Invoice',
    defaultScopeNotes:
      'Flights excluded unless listed separately. Visa documentation/application assistance does not guarantee visas. Rates subject to availability until deposit clears.',
    closingNote: 'We look forward to crafting your journey with RR Wanders.',
  },
  '03': {
    code: '03',
    brand: 'RR Marketing',
    documentTitle: 'MARKETING PROPOSAL',
    formatLabel: 'Marketing / SEO / retainers proposal',
    introEyebrow: 'RR Marketing · SEO & growth',
    defaultDescriptionHint: 'Marketing services proposal — retainers and projects (editable per client)',
    showMoq: false,
    showDelivery: false,
    showFabricHint: false,
    showInventorySku: false,
    showTripSummary: false,
    showHoursBilling: false,
    showPartnerFulfillment: false,
    partnerName: '',
    columns: ['line', 'description', 'qty', 'unit', 'unit_price', 'amount', 'total'],
    sectionHeadings: {
      billTo: 'Client',
      scope: 'Engagement overview',
      lines: 'Services & retainers',
      commercial: 'Fees & payment',
      terms: 'Scope notes',
    },
    defaultPaymentTerms: 'Monthly retainer in advance · projects as agreed',
    defaultScopeNotes:
      'Deliverables, channels and KPIs are agreed per client and remain editable. This proposal does not include ad media spend unless listed.',
    closingNote: 'Ready when you are — we will tailor this proposal to your goals.',
  },
  '04': {
    code: '04',
    brand: 'RR Connect',
    documentTitle: 'VIRTUAL ASSISTANCE QUOTATION',
    formatLabel: 'VA hours & services quotation',
    introEyebrow: 'RR Connect · Virtual assistance',
    defaultDescriptionHint: 'Virtual assistance hours and services',
    showMoq: false,
    showDelivery: false,
    showFabricHint: false,
    showInventorySku: false,
    showTripSummary: false,
    showHoursBilling: true,
    showPartnerFulfillment: true,
    partnerName: 'Konekt+',
    columns: ['line', 'description', 'hours', 'rate', 'amount', 'total'],
    sectionHeadings: {
      billTo: 'Client',
      scope: 'Service arrangement',
      lines: 'Hours & services',
      commercial: 'Billing',
      terms: 'Service notes',
    },
    defaultPaymentTerms: 'Monthly invoice for hours / retained hours as agreed',
    defaultScopeNotes:
      'Manpower is fulfilled by our Philippines partner Konekt+ (Manila). RR Connect invoices the client for agreed hours and services. Roles, hours and rates are editable per client engagement.',
    closingNote: 'We look forward to supporting your operations with RR Connect.',
  },
  '05': {
    code: '05',
    brand: 'RR Care',
    documentTitle: 'CARE / MEDICAL TRAVEL QUOTATION',
    formatLabel: 'Care / medical travel quotation',
    introEyebrow: 'RR Care · Medical tours & care',
    defaultDescriptionHint: 'Care / medical travel services (editable)',
    showMoq: false,
    showDelivery: false,
    showFabricHint: false,
    showInventorySku: false,
    showTripSummary: true,
    showHoursBilling: false,
    showPartnerFulfillment: false,
    partnerName: '',
    columns: ['line', 'description', 'qty', 'unit_price', 'amount', 'total'],
    sectionHeadings: {
      billTo: 'Prepared for',
      scope: 'Care overview',
      lines: 'Services',
      commercial: 'Payment',
      terms: 'Notes',
    },
    defaultPaymentTerms: 'As agreed per care plan',
    defaultScopeNotes: 'Medical decisions remain with licensed providers. RR Care coordinates arrangements as quoted.',
    closingNote: 'We are here to support your care journey.',
  },
  '06': {
    code: '06',
    brand: 'RR Trading',
    documentTitle: 'TRADING QUOTATION',
    formatLabel: 'Sourcing / trading quotation',
    introEyebrow: 'RR Trading · Sourcing & supply',
    defaultDescriptionHint: 'Trading / sourcing — we help you get what you need',
    showMoq: false,
    showDelivery: true,
    showFabricHint: false,
    showInventorySku: false,
    showTripSummary: false,
    showHoursBilling: false,
    showPartnerFulfillment: false,
    partnerName: '',
    columns: ['line', 'description', 'qty', 'unit', 'unit_price', 'amount', 'total'],
    sectionHeadings: {
      billTo: 'Buyer',
      scope: 'Requirement',
      lines: 'Items / lots',
      commercial: 'Payment & delivery',
      terms: 'Trading notes',
    },
    defaultPaymentTerms: 'As agreed per deal',
    defaultScopeNotes:
      'RR Trading sources goods or arrangements to customer specification. Specs, quantities and Incoterms are editable per order. Availability and price subject to confirmation.',
    closingNote: 'Tell us what you need — we will help you get it.',
  },
}

/** Fix typo key if accidentally added - TypeScript will catch introEyebrew if I left it */

export function getDivisionQuoteFormat(
  code: string | null | undefined,
  settings?: Record<string, string>,
): DivisionQuoteFormat {
  const c = ((code || '01') as DivisionCode)
  const base = DIVISION_QUOTE_FORMATS[c] || DIVISION_QUOTE_FORMATS['01']
  if (!settings) return base
  const prefix = `quoteFormat_${base.code}_`
  return {
    ...base,
    documentTitle: settings[`${prefix}documentTitle`] || base.documentTitle,
    formatLabel: settings[`${prefix}formatLabel`] || base.formatLabel,
    introEyebrow: settings[`${prefix}introEyebrow`] || base.introEyebrow,
    defaultPaymentTerms: settings[`${prefix}paymentTerms`] || base.defaultPaymentTerms,
    defaultScopeNotes: settings[`${prefix}scopeNotes`] || base.defaultScopeNotes,
    closingNote: settings[`${prefix}closingNote`] || base.closingNote,
    partnerName: settings[`${prefix}partnerName`] || base.partnerName,
  }
}

export function columnLabel(id: QuoteColumnId): string {
  switch (id) {
    case 'line':
      return '#'
    case 'sku':
      return 'SKU'
    case 'description':
      return 'Description'
    case 'sizes':
      return 'Sizes'
    case 'qty':
      return 'Qty'
    case 'unit':
      return 'Unit'
    case 'unit_price':
      return 'Unit price'
    case 'amount':
      return 'Amount'
    case 'vat':
      return 'VAT'
    case 'total':
      return 'Total'
    case 'hours':
      return 'Hours'
    case 'rate':
      return 'Rate/hr'
    case 'period':
      return 'Period'
    default:
      return id
  }
}
