import {
  PHILIPPINES_PACKAGE_CODE,
  SEED_IDS,
} from './wandersTourOpsConfig'
import type {
  PackageCostComponent,
  PackageSellingPrice,
  ScheduledDeparture,
  TourPackage,
  WandersPartner,
} from './types'
import { WANDERS_DEFAULT_PACKAGE_CODES, WANDERS_PRODUCT_TYPES } from './wandersConfig'

function nowIso() {
  return new Date().toISOString()
}

/** Baseline catalogue codes — extended fields defaulted for non-Philippines rows. */
export function buildDefaultTourPackages(): TourPackage[] {
  const now = nowIso()
  return WANDERS_DEFAULT_PACKAGE_CODES.map((p, i) => ({
    id: `wan-pkg-default-${p.code.toLowerCase()}`,
    code: p.code,
    name: p.name,
    destination: p.destination,
    destination_country: p.destination.includes('Kerala') ? 'India' : 'Philippines',
    advertising_market: 'TBC',
    travel_period: 'TBC',
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
    min_group_size: 10,
    smaller_group_policy: 'Private arrangement at a higher price',
    meal_tiers: 'Breakfast only|Full board',
    costing_method: 'Add component costs',
    supplier_currency: 'TBC',
    customer_selling_currency: 'TBC',
    status: 'Product development',
    primary_supplier_id: '',
    primary_coordinator_id: '',
    default_currency: 'TBC',
    guide_price: 0,
    active: true,
    notes: i === WANDERS_DEFAULT_PACKAGE_CODES.length - 1 ? 'Use for fully custom itineraries' : '',
    created_at: now,
    updated_at: now,
  }))
}

export function buildChristinePartner(): WandersPartner {
  const now = nowIso()
  return {
    id: SEED_IDS.supplierChristine,
    name: 'Christine',
    partner_type: 'Local supplier/travel agency',
    country: 'Philippines',
    destination: 'Philippines',
    status: 'Rates received; initial role completed',
    role_summary: 'Local supplier/travel agency providing Philippines land arrangements.',
    responsibilities: 'Local reservations and fulfilment once a booking is received.',
    communication_route: 'Through Koko',
    next_involvement:
      'When RR Wanders receives a booking or needs availability reconfirmed',
    booking_stage_responsibility: 'Local reservations and fulfilment',
    contact_name: 'Christine',
    contact_email: '',
    contact_phone: '',
    currency: 'PHP',
    notes: 'Synthetic seed — not a live Zoho/CRM contact sync.',
    active: true,
    created_at: now,
    updated_at: now,
  }
}

export function buildKokoPartner(): WandersPartner {
  const now = nowIso()
  return {
    id: SEED_IDS.coordinatorKoko,
    name: 'Koko',
    partner_type: 'Philippines coordinator',
    country: 'Philippines',
    destination: 'Philippines',
    status: 'Active',
    role_summary: 'Coordinator between RR Wanders and Christine.',
    responsibilities:
      'Package clarification, communication, booking coordination and local operational support',
    communication_route: 'Direct with RR Wanders; relays to Christine',
    next_involvement: 'Ongoing coordination during product development and bookings',
    booking_stage_responsibility: 'Booking coordination and local operational support',
    contact_name: 'Koko',
    contact_email: '',
    contact_phone: '',
    currency: 'PHP',
    notes: 'Synthetic seed — not a live Zoho/CRM contact sync.',
    active: true,
    created_at: now,
    updated_at: now,
  }
}

export function buildPhilippinesKeralaPackage(): TourPackage {
  const now = nowIso()
  return {
    id: SEED_IDS.packagePhilippines,
    code: PHILIPPINES_PACKAGE_CODE,
    name: 'Philippines packages for Kerala market (Jan–Mar 2027)',
    destination: 'Philippines',
    destination_country: 'Philippines',
    advertising_market: 'Kerala, India',
    travel_period: 'January–March 2027',
    product_type: 'Other Philippines packages',
    nights: 0,
    days: 0,
    summary:
      'Philippines tour product advertised to Kerala, India. Supplier rates received; selling price in INR pending finalization.',
    inclusions: 'Land arrangements per meal tier (Breakfast only / Full board) — detail TBC per itinerary version',
    exclusions: 'International flights, visas, travel insurance, personal expenses unless stated',
    min_group_size: 10,
    smaller_group_policy: 'Private arrangement at a higher price',
    meal_tiers: 'Breakfast only|Full board',
    costing_method: 'Add component costs',
    supplier_currency: 'PHP',
    customer_selling_currency: 'INR',
    status: 'Product development / supplier rates received',
    primary_supplier_id: SEED_IDS.supplierChristine,
    primary_coordinator_id: SEED_IDS.coordinatorKoko,
    default_currency: 'PHP',
    guide_price: 0,
    active: true,
    notes:
      'Customer selling currency INR when Kerala selling price is finalized. Do not store this only in lead descriptions.',
    created_at: now,
    updated_at: now,
  }
}

/** Placeholder components — amounts left 0 until detailed supplier breakdown is entered. */
export function buildPhilippinesCostComponents(): PackageCostComponent[] {
  const now = nowIso()
  const base = {
    package_id: SEED_IDS.packagePhilippines,
    supplier_id: SEED_IDS.supplierChristine,
    currency: 'PHP',
    per_person: true,
    amount: 0,
    created_at: now,
    updated_at: now,
  }
  return [
    {
      ...base,
      id: 'wan-cost-ph-hotel-bb',
      category: 'Hotel',
      description: 'Accommodation — Breakfast only tier (rates received; amount TBC in CRM)',
      meal_tier: 'Breakfast only',
      notes: 'Enter PHP amount from Christine rate sheet',
      sort_order: 1,
    },
    {
      ...base,
      id: 'wan-cost-ph-hotel-fb',
      category: 'Hotel',
      description: 'Accommodation — Full board tier (rates received; amount TBC in CRM)',
      meal_tier: 'Full board',
      notes: 'Enter PHP amount from Christine rate sheet',
      sort_order: 2,
    },
    {
      ...base,
      id: 'wan-cost-ph-transport',
      category: 'Transport',
      description: 'Local transfers and transport',
      meal_tier: '',
      notes: 'Shared across meal tiers unless stated otherwise',
      sort_order: 3,
    },
    {
      ...base,
      id: 'wan-cost-ph-activities',
      category: 'Activity',
      description: 'Activities and excursions',
      meal_tier: '',
      notes: '',
      sort_order: 4,
    },
  ]
}

export function buildPhilippinesSellingPrices(): PackageSellingPrice[] {
  const now = nowIso()
  return [
    {
      id: 'wan-price-ph-bb-inr',
      package_id: SEED_IDS.packagePhilippines,
      meal_tier: 'Breakfast only',
      label: 'Kerala selling price — Breakfast only',
      selling_amount: 0,
      selling_currency: 'INR',
      cost_amount: 0,
      cost_currency: 'PHP',
      fx_rate_to_selling: 0,
      margin_amount: 0,
      margin_pct: 0,
      status: 'Pending finalization',
      notes: 'INR selling price to be finalized for Kerala market. Do not invent a price.',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'wan-price-ph-fb-inr',
      package_id: SEED_IDS.packagePhilippines,
      meal_tier: 'Full board',
      label: 'Kerala selling price — Full board',
      selling_amount: 0,
      selling_currency: 'INR',
      cost_amount: 0,
      cost_currency: 'PHP',
      fx_rate_to_selling: 0,
      margin_amount: 0,
      margin_pct: 0,
      status: 'Pending finalization',
      notes: 'INR selling price to be finalized for Kerala market. Do not invent a price.',
      created_at: now,
      updated_at: now,
    },
  ]
}

export function buildPhilippinesDepartures(): ScheduledDeparture[] {
  const now = nowIso()
  const mk = (
    id: string,
    label: string,
    departureDate: string,
    returnDate: string,
    deadline: string,
  ): ScheduledDeparture => ({
    id,
    package_id: SEED_IDS.packagePhilippines,
    label,
    departure_date: departureDate,
    return_date: returnDate,
    capacity: 20,
    booked_pax: 0,
    min_group_size: 10,
    min_group_met: false,
    booking_deadline: deadline,
    supplier_confirmation_status: 'Not requested',
    status: 'Open',
    total_customer_payments: 0,
    payments_currency: 'INR',
    total_costs: 0,
    costs_currency: 'PHP',
    revenue: 0,
    revenue_currency: 'INR',
    profit: 0,
    profit_currency: 'INR',
    supplier_id: SEED_IDS.supplierChristine,
    coordinator_id: SEED_IDS.coordinatorKoko,
    notes: 'Individual departure window — exact commercial dates adjustable. Synthetic seed only.',
    created_at: now,
    updated_at: now,
  })
  return [
    mk(SEED_IDS.departureJan, 'January 2027 departure', '2027-01-15', '2027-01-22', '2026-12-15'),
    mk(SEED_IDS.departureFeb, 'February 2027 departure', '2027-02-12', '2027-02-19', '2027-01-12'),
    mk(SEED_IDS.departureMar, 'March 2027 departure', '2027-03-12', '2027-03-19', '2027-02-12'),
  ]
}
