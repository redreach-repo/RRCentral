/**
 * RR Wanders tour-operations configuration.
 * Customer leads/deals stay separate from packages, partners, departures and bookings.
 */

export const PACKAGE_STATUSES = [
  'Product development',
  'Supplier rates received',
  'Selling price pending',
  'Ready to sell',
  'Active',
  'On hold',
  'Retired',
] as const

export const MEAL_TIERS = ['Breakfast only', 'Full board'] as const

export const COSTING_METHODS = [
  'Add component costs',
  'Fixed package cost',
  'TBC',
] as const

export const PARTNER_TYPES = [
  'Local supplier/travel agency',
  'Destination management company',
  'Philippines coordinator',
  'Hotel',
  'Transport provider',
  'Activity provider',
  'Photographer',
  'Airline/ticketing',
  'Other',
] as const

export const PARTNER_STATUSES = [
  'Prospect',
  'Rates requested',
  'Rates received',
  'Initial role completed',
  'Active',
  'On hold',
  'Inactive',
] as const

export const DEPARTURE_STATUSES = [
  'Open',
  'Soft hold',
  'Minimum not met',
  'Minimum met',
  'Supplier confirmation pending',
  'Confirmed',
  'Closed',
  'Cancelled',
] as const

export const BOOKING_LINK_STATUSES = [
  'Enquiry linked',
  'Option held',
  'Deposit pending',
  'Deposit paid',
  'Confirmed',
  'Cancelled',
] as const

export const COST_COMPONENT_CATEGORIES = [
  'Hotel',
  'Transport',
  'Activity',
  'Guide/coordinator',
  'Meal',
  'Entrance fee',
  'Gift',
  'Photography',
  'Other',
] as const

/** Stable synthetic IDs for local seed only — not live Zoho records. */
export const SEED_IDS = {
  packagePhilippines: 'wan-pkg-ph-kerala-2027',
  supplierChristine: 'wan-partner-christine',
  coordinatorKoko: 'wan-partner-koko',
  departureJan: 'wan-dep-ph-2027-01',
  departureFeb: 'wan-dep-ph-2027-02',
  departureMar: 'wan-dep-ph-2027-03',
} as const

export const PHILIPPINES_PACKAGE_CODE = 'WAN-PH-KER-2027'
