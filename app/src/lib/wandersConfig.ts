/**
 * RR Wanders travel CRM configuration.
 * Values marked TBC must stay editable — never invent legal/tax/jurisdiction facts.
 */

export const WANDERS_DIVISION_CODE = '02'
export const WANDERS_BRAND = 'RR Wanders'

/** Working default until owner confirms base/reporting currency. */
export const WANDERS_BASE_CURRENCY_TBC = 'TBC'

export const WANDERS_CUSTOMER_TYPES = [
  'B2C direct traveller',
  'B2B company',
  'B2B travel agent/partner',
  'Individual traveller',
  'Lead passenger',
  'Family/group organiser',
  'Corporate booker',
  'Couples',
  'Families',
  'FIT individual',
  'Small private group',
  'Larger group',
  'Corporate/incentive group',
] as const

export const WANDERS_SOURCE_MARKETS = [
  'UAE',
  'Other GCC',
  'United States',
  'Europe',
  'Canada',
  'Australia',
  'Kerala',
  'Philippines',
  'Other',
  'TBC',
] as const

export const WANDERS_DESTINATION_REGIONS = [
  'Kerala',
  'Cebu',
  'Bohol',
  'Palawan',
  'Boracay',
  'Other Philippines',
  'Custom international',
  'Multiple',
  'TBC',
] as const

/** Travel sales pipeline — separate from Threads CRM stages. */
export const WANDERS_SALES_STAGES = [
  'New enquiry',
  'Contact attempted',
  'Qualified',
  'Requirements collected',
  'Preparing itinerary/quote',
  'Quote sent',
  'Follow-up',
  'Verbal acceptance',
  'Deposit requested',
  'Deposit paid',
  'Booking in progress',
  'Confirmed',
  'Balance due',
  'Fully paid',
  'Travel documents sent',
  'Travelling',
  'Travelled/completed',
  'Post-trip follow-up',
  'Won',
  'Lost/cancelled',
] as const

export const WANDERS_BOOKING_STATUSES = [
  'Deposit pending',
  'Deposit paid',
  'Availability recheck',
  'Booking in progress',
  'Supplier confirmation pending',
  'Partially confirmed',
  'Confirmed',
  'Passenger documents pending',
  'Visa assistance pending',
  'Balance pending',
  'Ready to travel',
  'Travelling',
  'Travelled',
  'Cancelled',
] as const

export const WANDERS_LOST_REASONS = [
  'Price too high',
  'No response',
  'Dates unavailable',
  'Customer postponed',
  'Customer changed destination',
  'Visa/immigration concern',
  'Flight price changed',
  'Competitor selected',
  'Payment terms',
  'Supplier unavailable',
  'Group size not reached',
  'Duplicate/test enquiry',
  'Other',
] as const

export const WANDERS_PRODUCT_TYPES = [
  'Kerala family and couple holidays',
  'Kerala private group tours',
  'Cebu and Bohol holidays',
  'Palawan packages',
  'Cebu and Boracay packages',
  'Other Philippines packages',
  'Custom international leisure itineraries',
  'Group tours',
  'Corporate incentive travel',
  'Hotels',
  'Local transfers and transport',
  'Activities and excursions',
  'Tour coordinators and guides',
  'Photography',
  'Client gifts and souvenirs',
  'Optional flight arrangement',
  'Visa documentation/application assistance',
] as const

/** Editable package codes — conventions are configurable in settings. */
export const WANDERS_DEFAULT_PACKAGE_CODES = [
  { code: 'WAN-KER-7D6N', name: 'Kerala 7D/6N', destination: 'Kerala', nights: 6 },
  { code: 'WAN-CEB-BOH-6D5N', name: 'Cebu & Bohol 6D/5N', destination: 'Cebu / Bohol', nights: 5 },
  { code: 'WAN-PAL-6D5N', name: 'Palawan 6D/5N', destination: 'Palawan', nights: 5 },
  { code: 'WAN-CEB-BOR-7D6N', name: 'Cebu & Boracay 7D/6N', destination: 'Cebu / Boracay', nights: 6 },
  { code: 'WAN-CUSTOM', name: 'Custom itinerary', destination: 'Custom', nights: 0 },
] as const

export const WANDERS_FLIGHT_STATES = [
  'Flights excluded',
  'Flight quotation requested',
  'Flight option supplied separately',
  'Flights added and payable separately',
  'Flights confirmed',
] as const

export const WANDERS_VISA_STATUSES = [
  'Not required',
  'Requirements being checked',
  'Documents requested',
  'Documents pending',
  'Ready for submission',
  'Submitted',
  'Additional documents requested',
  'Customer action required',
  'Completed',
  'Refused',
  'Withdrawn',
] as const

export const WANDERS_SERVICE_MARKS = [
  'Included',
  'Optional',
  'Additional charge',
  'Excluded',
  'To be confirmed',
  'Not applicable',
] as const

export const WANDERS_COMM_CHANNELS = ['WhatsApp', 'Phone', 'Email'] as const

/** Working commercial defaults — editable; not legal facts. */
export const WANDERS_DEFAULT_DEPOSIT_PERCENT = 50
export const WANDERS_DEFAULT_HOLD_BUSINESS_DAYS = 3
export const WANDERS_DEFAULT_BALANCE_DAYS_BEFORE = '30-45'
export const WANDERS_TERMS_VERSION = 'WAN-TERMS-2026-07-DRAFT'

export const WANDERS_TBC_SETTINGS_KEYS = [
  'wandersLegalEntityName',
  'wandersTradingName',
  'wandersRegisteredCountry',
  'wandersRegisteredState',
  'wandersRegistrationNumber',
  'wandersRegisteredAddress',
  'wandersTaxRegistration',
  'wandersTaxRules',
  'wandersGoverningLaw',
  'wandersDisputeJurisdiction',
  'wandersComplaintsContact',
  'wandersPaymentAccountNames',
  'wandersBaseCurrency',
  'wandersAccountingRevenueRule',
] as const

export const WANDERS_SETTINGS_DEFAULTS: Record<string, string> = {
  wandersLegalEntityName: 'TBC',
  wandersTradingName: 'RR Wanders',
  wandersRegisteredCountry: 'TBC',
  wandersRegisteredState: 'TBC',
  wandersRegistrationNumber: 'TBC',
  wandersRegisteredAddress: 'TBC',
  wandersTaxRegistration: 'TBC',
  wandersTaxRules: 'TBC — do not assume UAE VAT 5%',
  wandersGoverningLaw: 'TBC',
  wandersDisputeJurisdiction: 'TBC',
  wandersComplaintsContact: 'TBC',
  wandersPaymentAccountNames: 'TBC',
  wandersBaseCurrency: 'TBC',
  wandersAccountingRevenueRule: 'TBC',
  wandersDepositPercent: String(WANDERS_DEFAULT_DEPOSIT_PERCENT),
  wandersHoldBusinessDays: String(WANDERS_DEFAULT_HOLD_BUSINESS_DAYS),
  wandersBalanceDaysBefore: WANDERS_DEFAULT_BALANCE_DAYS_BEFORE,
  wandersTermsVersion: WANDERS_TERMS_VERSION,
  wandersPackageCodePrefix: 'WAN',
  wandersQuoteLanguage: 'en',
  wandersApplyVat: 'no',
  wandersVatRate: 'TBC',
}

export function isWandersDivision(code?: string | null): boolean {
  return (code || '') === WANDERS_DIVISION_CODE
}

/** Resolve reporting/base currency — returns TBC until owner confirms. */
export function resolveWandersBaseCurrency(configured?: string | null): string {
  const c = (configured || '').trim().toUpperCase()
  if (!c) return WANDERS_BASE_CURRENCY_TBC
  return c
}

/** For math only when a numeric base is required; never invent jurisdiction tax. */
export function wandersMathCurrency(configured?: string | null): string | null {
  const c = resolveWandersBaseCurrency(configured)
  if (c === 'TBC' || c === '') return null
  return c
}
