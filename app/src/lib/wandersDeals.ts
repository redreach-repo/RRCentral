import { format } from 'date-fns'
import { db } from './db'
import {
  WANDERS_DEFAULT_DEPOSIT_PERCENT,
  WANDERS_DEFAULT_HOLD_BUSINESS_DAYS,
  WANDERS_DIVISION_CODE,
  WANDERS_SETTINGS_DEFAULTS,
  WANDERS_TERMS_VERSION,
} from './wandersConfig'
import { buildWandersTermsText } from './wandersTerms'
import { ensureTourOpsSeeded } from './wandersTourOps'
import type { TourPackage, WandersDeal, WandersPassenger, WandersTermsAcceptance } from './types'
import { logActivity } from './activity'

export function emptyWandersDeal(partial?: Partial<WandersDeal>): WandersDeal {
  const now = new Date().toISOString()
  const depositPct = WANDERS_DEFAULT_DEPOSIT_PERCENT
  return {
    id: crypto.randomUUID(),
    crm_id: '',
    client_name: '',
    lead_contact: '',
    email: '',
    mobile: '',
    customer_type: 'B2C direct traveller',
    lead_source: '',
    source_market: 'TBC',
    country_of_residence: '',
    nationality: '',
    departure_country: '',
    departure_airport: '',
    destination_country: '',
    destination_regions: 'Kerala',
    multiple_destinations: false,
    departure_date: null,
    return_date: null,
    nights: 0,
    flexible_dates: false,
    adults: 2,
    children: 0,
    child_ages: '',
    infants: 0,
    room_requirements: '',
    hotel_category: '',
    meal_plan: '',
    budget_amount: 0,
    budget_currency: 'TBC',
    purpose_of_travel: 'Leisure',
    flights_required: 'Maybe',
    flight_state: 'Flights excluded',
    visa_assistance_required: false,
    visa_status: 'Not required',
    transfers_required: true,
    activities_interests: '',
    special_occasion: '',
    accessibility_requirements: '',
    medical_dietary: '',
    preferred_channel: 'WhatsApp',
    campaign_source: '',
    package_code: 'WAN-CUSTOM',
    product_type: 'Custom international leisure itineraries',
    sales_stage: 'New enquiry',
    booking_status: 'Deposit pending',
    sales_owner: '',
    operations_owner: '',
    next_action: 'WhatsApp',
    follow_up_date: format(new Date(), 'yyyy-MM-dd'),
    deal_status: 'Open',
    lost_reason: '',
    quote_ref: '',
    quote_id: '',
    quote_value: 0,
    quote_currency: 'TBC',
    estimated_cost: 0,
    estimated_profit: 0,
    estimated_margin_pct: 0,
    deposit_percent: depositPct,
    deposit_amount: 0,
    deposit_deadline: null,
    deposit_status: 'Expected',
    balance_amount: 0,
    balance_deadline: null,
    balance_status: 'Expected',
    hold_business_days: WANDERS_DEFAULT_HOLD_BUSINESS_DAYS,
    terms_version: WANDERS_TERMS_VERSION,
    terms_text: '',
    terms_accepted: false,
    terms_accepted_at: null,
    terms_accepted_by: '',
    acceptance_method: '',
    insurance_recommended: true,
    insurance_declined: false,
    special_requirements_declared: false,
    passenger_details_checked: false,
    gifts_included: false,
    photography_included: false,
    marketing_photo_consent: false,
    notes: '',
    booking_currency: 'TBC',
    division_code: WANDERS_DIVISION_CODE,
    created_by: '',
    updated_by: '',
    created_at: now,
    updated_at: now,
    ...partial,
  }
}

export function recomputeCommercial(deal: WandersDeal): Pick<
  WandersDeal,
  'deposit_amount' | 'balance_amount' | 'estimated_profit' | 'estimated_margin_pct'
> {
  const value = Number(deal.quote_value) || 0
  const cost = Number(deal.estimated_cost) || 0
  const pct = Number(deal.deposit_percent) || WANDERS_DEFAULT_DEPOSIT_PERCENT
  const deposit = Math.round(value * (pct / 100) * 100) / 100
  const profit = Math.round((value - cost) * 100) / 100
  const margin = value > 0 ? Math.round((profit / value) * 1000) / 10 : 0
  return {
    deposit_amount: deposit,
    balance_amount: Math.round((value - deposit) * 100) / 100,
    estimated_profit: profit,
    estimated_margin_pct: margin,
  }
}

export async function loadWandersDeals(): Promise<WandersDeal[]> {
  const { data, error } = await db.from('wanders_deals').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []) as WandersDeal[]
}

export async function saveWandersDeal(
  deal: WandersDeal,
  userEmail: string,
): Promise<WandersDeal> {
  const commercial = recomputeCommercial(deal)
  const termsText =
    deal.terms_text ||
    buildWandersTermsText({
      includeFlightsClause: deal.flight_state !== 'Flights excluded',
      depositPercent: deal.deposit_percent,
      holdBusinessDays: deal.hold_business_days,
      version: deal.terms_version || WANDERS_TERMS_VERSION,
    })
  const row: WandersDeal = {
    ...deal,
    ...commercial,
    terms_text: termsText,
    division_code: WANDERS_DIVISION_CODE,
    updated_by: userEmail,
    updated_at: new Date().toISOString(),
  }
  const existing = await db.from('wanders_deals').select('id').eq('id', deal.id).maybeSingle()
  if (existing.data) {
    const { id: _id, created_at: _c, created_by: _cb, ...patch } = row
    const { error } = await db.from('wanders_deals').update(patch).eq('id', deal.id)
    if (error) throw error
  } else {
    row.created_by = userEmail || row.created_by
    const { error } = await db.from('wanders_deals').insert(row)
    if (error) throw error
  }
  await logActivity('save_wanders_deal', 'wanders_deal', row.id, row.client_name, row.sales_stage)
  return row
}

export async function acceptWandersTerms(opts: {
  deal: WandersDeal
  acceptedBy: string
  method: string
  userEmail: string
  governingLaw?: string
  disputeJurisdiction?: string
}): Promise<{ deal: WandersDeal; acceptance: WandersTermsAcceptance }> {
  if (!opts.deal.terms_version) {
    throw new Error('Cannot accept without a terms version')
  }
  const text =
    opts.deal.terms_text ||
    buildWandersTermsText({
      includeFlightsClause: opts.deal.flight_state !== 'Flights excluded',
      depositPercent: opts.deal.deposit_percent,
      holdBusinessDays: opts.deal.hold_business_days,
      version: opts.deal.terms_version,
      governingLaw: opts.governingLaw,
      disputeJurisdiction: opts.disputeJurisdiction,
    })
  const now = new Date().toISOString()
  const acceptance: WandersTermsAcceptance = {
    id: crypto.randomUUID(),
    deal_id: opts.deal.id,
    quote_ref: opts.deal.quote_ref || '',
    terms_version: opts.deal.terms_version,
    terms_text: text,
    accepted_at: now,
    accepted_by: opts.acceptedBy,
    acceptance_method: opts.method,
    created_by: opts.userEmail,
    created_at: now,
  }
  const { error } = await db.from('wanders_terms_acceptances').insert(acceptance)
  if (error) throw error
  const deal = await saveWandersDeal(
    {
      ...opts.deal,
      terms_text: text,
      terms_accepted: true,
      terms_accepted_at: now,
      terms_accepted_by: opts.acceptedBy,
      acceptance_method: opts.method,
    },
    opts.userEmail,
  )
  await logActivity(
    'accept_wanders_terms',
    'wanders_deal',
    deal.id,
    `${acceptance.terms_version} · ${opts.method}`,
    opts.acceptedBy,
  )
  return { deal, acceptance }
}

export async function loadPassengers(dealId: string): Promise<WandersPassenger[]> {
  const { data, error } = await db
    .from('wanders_passengers')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as WandersPassenger[]
}

export async function savePassenger(
  p: Omit<WandersPassenger, 'created_at' | 'updated_at'> & {
    created_at?: string
    updated_at?: string
  },
  userEmail: string,
): Promise<WandersPassenger> {
  const now = new Date().toISOString()
  const row: WandersPassenger = {
    ...p,
    id: p.id || crypto.randomUUID(),
    updated_by: userEmail,
    updated_at: now,
    created_at: p.created_at || now,
  }
  const existing = await db.from('wanders_passengers').select('id').eq('id', row.id).maybeSingle()
  if (existing.data) {
    const { id: _id, created_at: _c, ...patch } = row
    const { error } = await db.from('wanders_passengers').update(patch).eq('id', row.id)
    if (error) throw error
  } else {
    const { error } = await db.from('wanders_passengers').insert(row)
    if (error) throw error
  }
  await logActivity('save_passenger', 'wanders_passenger', row.id, row.deal_id, 'passenger_update')
  return row
}

export async function deletePassenger(id: string): Promise<void> {
  const { error } = await db.from('wanders_passengers').delete().eq('id', id)
  if (error) throw error
}

export async function ensureTourPackagesSeeded(): Promise<TourPackage[]> {
  const { ensureTourOpsSeeded } = await import('./wandersTourOps')
  const { packages } = await ensureTourOpsSeeded()
  return packages
}

export async function ensureWandersSettings(): Promise<void> {
  for (const [key, value] of Object.entries(WANDERS_SETTINGS_DEFAULTS)) {
    const { data } = await db.from('app_settings').select('key').eq('key', key).maybeSingle()
    if (!data) {
      await db.from('app_settings').insert({ key, value })
    }
  }
}

export const QUALIFICATION_MESSAGE =
  'Hi [Name], thank you for contacting RR Wanders. Please send us your preferred destination, travel dates, departure airport, number of adults and children, approximate budget, and whether you need flights included. We’ll use this to prepare the right option for you.'

export function quoteFollowUpMessage(name: string, destination: string): string {
  return `Hi ${name || '[Name]'}, just checking whether you had a chance to review the ${destination || '[Destination]'} proposal. Let me know if you would like us to adjust the hotel, dates, activities or budget.`
}
