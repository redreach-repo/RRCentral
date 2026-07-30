export type UserRole = 'admin' | 'sales'

export interface CrmContact {
  id: string
  name: string
  email: string
  phone: string
  role: string
}

export interface Client {
  id: string
  company_name: string
  primary_contact: string
  email: string
  mobile: string
  office: string
  address: string
  trn: string
  website?: string
  company_owner?: string
  notes: string
  contacts?: CrmContact[]
  created_at: string
}

export interface CrmEntry {
  id: string
  company_name: string
  primary_contact: string
  email_phone: string
  mobile_number: string
  office_number: string
  notes: string
  follow_up_date: string | null
  next_action: string
  /** Red Reach salesperson assigned to this account (not the client's business owner). */
  owner: string
  /** Name of the client's business owner / proprietor. */
  company_owner: string
  address: string
  website: string
  trn: string
  /** Sales pipeline stage: Lead → … → Won/Lost */
  pipeline_stage: string
  quote_ref: string
  /** Why the deal was Won or Lost (company-level). */
  outcome_reason: string
  calendar_event_id: string
  contacts?: CrmContact[]
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface FollowUpUpdate {
  id: string
  crm_id: string | null
  company: string
  update_text: string
  user_email: string
  created_at: string
}

export interface Quotation {
  id: string
  client: string
  vertical: string
  reference_number: string
  date: string | null
  description: string
  amount: number
  status: string
  division_code: string
  base_reference: string
  revision: number
  quote_id: string
  payment_terms: string
  moq: string
  notes: string
  delivery_terms: string
  outcome_reason: string
  /** yyyy-MM-dd — set on finalize from quoteValidityDays */
  valid_until: string | null
  /** Document / booking currency (usually same as quotation_currency). */
  currency: string
  /** Currency shown on the approved quotation. */
  quotation_currency: string
  /** Preferred customer payment currency (may differ). */
  payment_currency: string
  /** Supplier settlement currency. */
  supplier_currency: string
  /** Reporting / booking currency (often AED). */
  booking_currency: string
  /** 1 quotation_currency = fx_rate × base (AED). Locked when approved. */
  fx_rate: number
  fx_rate_date: string | null
  fx_rate_approved_by: string
  fx_rate_approved_at: string | null
  /** Base-currency (AED) equivalent of amount at fx_rate. */
  base_amount: number
  /** Estimated bank/conversion fees in quotation currency. */
  conversion_fee_estimate: number
  bank_fee_estimate: number
  /** Who bears bank/FX charges: Customer | RR Wanders | Shared */
  charges_borne_by: string
  /** Net amount RR Wanders must receive (quotation currency). */
  net_amount_required: string
  /** Whether alternate payment currencies are accepted. */
  accept_other_payment_currency: boolean
  /** Rate validity deadline yyyy-MM-dd. */
  rate_valid_until: string | null
  payment_instructions: string
  /** Optional supplier cost in base for GP. */
  supplier_cost_base: number
  estimated_gross_profit_base: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

/** Customer payment against a booking/quote/invoice — original FC amount is immutable. */
export interface CustomerPayment {
  id: string
  /** Link to quotation.id or booking key. */
  booking_id: string
  quote_ref: string
  invoice_ref: string
  client: string
  payment_date: string | null
  amount_received: number
  /** Original currency received — never overwritten after save. */
  currency: string
  fx_rate: number
  fx_rate_date: string | null
  fx_rate_approved_by: string
  /** Base (AED) equivalent of net received. */
  base_amount: number
  payment_method: string
  bank_provider: string
  processing_fee: number
  conversion_fee: number
  net_amount: number
  payment_type: string
  transaction_ref: string
  proof_url: string
  status: string
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface CustomerRefund {
  id: string
  payment_id: string
  booking_id: string
  quote_ref: string
  client: string
  refund_date: string | null
  original_currency: string
  original_amount_received: number
  refund_currency: string
  amount_refunded: number
  fx_rate: number
  fx_rate_date: string | null
  conversion_fee: number
  bank_fee: number
  base_amount: number
  fx_gain_loss: number
  reason: string
  approved_by: string
  approved_at: string | null
  status: string
  notes: string
  created_by: string
  created_at: string
}

export interface SupplierCommitment {
  id: string
  booking_id: string
  quote_ref: string
  supplier_name: string
  description: string
  amount: number
  currency: string
  fx_rate: number
  fx_rate_date: string | null
  base_amount: number
  status: string
  due_date: string | null
  notes: string
  created_at: string
}

/** Approved/manual FX rate log — historical rates never auto-change. */
export interface FxRateEntry {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
  source: string
  approved_by: string
  approved_at: string
  notes: string
  created_at: string
}

export interface Invoice {
  id: string
  client: string
  vertical: string
  reference_number: string
  date: string | null
  description: string
  amount: number
  status: string
  payment_status: string
  payment_terms: string
  moq: string
  notes: string
  delivery_terms: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface LineItem {
  id: string
  doc_type: 'Quote' | 'Invoice'
  reference: string
  line_no: number
  description: string
  qty: number
  unit_price: number
  vat_rate: number
  amount: number
  vat_amount: number
  line_total: number
  remarks: string
  /** Optional catalogue SKU for inventory linkage. */
  sku?: string
  /** Optional size breakdown JSON, e.g. { S: 2, M: 4 }. */
  sizes_json?: string | Record<string, number> | null
  created_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  division_code: string
  unit_price: number
  moq: number
  fabric: string
  unit: string
  active: boolean
  notes: string
  /** Units physically on hand. */
  stock_on_hand: number
  /** Units reserved against awarded quotes. */
  stock_reserved: number
  /** Alert when available stock falls to this level. */
  reorder_level: number
  /** When true, quotes can break qty into size runs. */
  track_sizes: boolean
  /** Optional per-size on-hand counts. */
  size_stock?: Record<string, number> | null
  updated_at: string
}

export interface InventoryMovement {
  id: string
  sku: string
  qty_delta: number
  reserved_delta: number
  reason: string
  reference: string
  user_email: string
  created_at: string
}

export interface QuoteTemplate {
  id: string
  name: string
  division_code: string
  description: string
  items_json: unknown
  created_at: string
}

export interface IncomeEntry {
  id: string
  client_source: string
  category: string
  reference_number: string
  date: string | null
  description: string
  bill_amount: number
  vat: number
  total_amount: number
  status: string
  payment_method: string
  payment_status: string
}

export interface Expense {
  id: string
  date: string | null
  vendor: string
  category: string
  amount: number
  payment_method: string
  references_text: string
  notes: string
  created_at: string
}

export interface PaymentLogEntry {
  id: string
  invoice_ref: string
  client: string
  amount: number
  method: string
  notes: string
  user_email: string
  balance_after: number
  created_at: string
}

export interface Attachment {
  id: string
  entity_type: string
  entity_ref: string
  file_name: string
  storage_path: string
  url: string
  uploaded_by: string
  uploaded_at: string
}

export interface ActivityLogEntry {
  id: string
  action: string
  entity: string
  reference: string
  details: string
  user_email: string
  /** Optional link back to a CRM company for timeline filtering. */
  crm_id?: string | null
  created_at: string
}

export interface AppUser {
  id: string
  email: string
  name: string
  role: UserRole
  active: boolean
  created_at: string
}

export interface AppSetting {
  key: string
  value: string
}

/** RR Wanders travel deal — separate from Threads CRM pipeline. */
export interface WandersDeal {
  id: string
  /** Optional link to shared company CRM record. */
  crm_id: string
  client_name: string
  lead_contact: string
  email: string
  mobile: string
  customer_type: string
  lead_source: string
  source_market: string
  country_of_residence: string
  nationality: string
  departure_country: string
  departure_airport: string
  destination_country: string
  destination_regions: string
  multiple_destinations: boolean
  departure_date: string | null
  return_date: string | null
  nights: number
  flexible_dates: boolean
  adults: number
  children: number
  child_ages: string
  infants: number
  room_requirements: string
  hotel_category: string
  meal_plan: string
  budget_amount: number
  budget_currency: string
  purpose_of_travel: string
  flights_required: string
  flight_state: string
  visa_assistance_required: boolean
  visa_status: string
  transfers_required: boolean
  activities_interests: string
  special_occasion: string
  accessibility_requirements: string
  medical_dietary: string
  preferred_channel: string
  campaign_source: string
  package_code: string
  product_type: string
  sales_stage: string
  booking_status: string
  sales_owner: string
  operations_owner: string
  next_action: string
  follow_up_date: string | null
  deal_status: string
  lost_reason: string
  quote_ref: string
  quote_id: string
  quote_value: number
  quote_currency: string
  estimated_cost: number
  estimated_profit: number
  estimated_margin_pct: number
  deposit_percent: number
  deposit_amount: number
  deposit_deadline: string | null
  deposit_status: string
  balance_amount: number
  balance_deadline: string | null
  balance_status: string
  hold_business_days: number
  terms_version: string
  terms_text: string
  terms_accepted: boolean
  terms_accepted_at: string | null
  terms_accepted_by: string
  acceptance_method: string
  insurance_recommended: boolean
  insurance_declined: boolean
  special_requirements_declared: boolean
  passenger_details_checked: boolean
  gifts_included: boolean
  photography_included: boolean
  marketing_photo_consent: boolean
  notes: string
  /** Base/reporting currency for this deal — may be TBC. */
  booking_currency: string
  division_code: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

/** Sensitive passenger record — access-controlled; never public/marketing. */
export interface WandersPassenger {
  id: string
  deal_id: string
  title: string
  full_passport_name: string
  is_lead: boolean
  passport_number: string
  nationality: string
  date_of_birth: string | null
  gender: string
  passport_issue_date: string | null
  passport_expiry_date: string | null
  passport_issuing_country: string
  country_of_residence: string
  residency_status: string
  visa_status: string
  mobile: string
  email: string
  emergency_contact: string
  dietary_requirements: string
  medical_accessibility_notes: string
  passenger_class: string
  created_at: string
  updated_at: string
  updated_by: string
}

/** Internal tour package catalogue (not public website products; not Zoho Lead text). */
export interface TourPackage {
  id: string
  code: string
  name: string
  destination: string
  destination_country: string
  advertising_market: string
  travel_period: string
  product_type: string
  nights: number
  days: number
  summary: string
  inclusions: string
  exclusions: string
  min_group_size: number
  smaller_group_policy: string
  meal_tiers: string
  costing_method: string
  supplier_currency: string
  customer_selling_currency: string
  status: string
  primary_supplier_id: string
  primary_coordinator_id: string
  default_currency: string
  guide_price: number
  active: boolean
  notes: string
  created_at: string
  updated_at: string
}

/** Supplier or coordinator partner — separate from customer leads. */
export interface WandersPartner {
  id: string
  name: string
  partner_type: string
  country: string
  destination: string
  status: string
  role_summary: string
  responsibilities: string
  communication_route: string
  next_involvement: string
  booking_stage_responsibility: string
  contact_name: string
  contact_email: string
  contact_phone: string
  currency: string
  notes: string
  active: boolean
  created_at: string
  updated_at: string
}

/** Cost line on a package — summed when costing_method is Add component costs. */
export interface PackageCostComponent {
  id: string
  package_id: string
  category: string
  description: string
  meal_tier: string
  supplier_id: string
  amount: number
  currency: string
  per_person: boolean
  notes: string
  sort_order: number
  created_at: string
  updated_at: string
}

/** Planned selling price / margin snapshot (INR may be TBC until finalized). */
export interface PackageSellingPrice {
  id: string
  package_id: string
  meal_tier: string
  label: string
  selling_amount: number
  selling_currency: string
  cost_amount: number
  cost_currency: string
  fx_rate_to_selling: number
  margin_amount: number
  margin_pct: number
  status: string
  notes: string
  created_at: string
  updated_at: string
}

/** Individual scheduled departure for a package. */
export interface ScheduledDeparture {
  id: string
  package_id: string
  label: string
  departure_date: string | null
  return_date: string | null
  capacity: number
  booked_pax: number
  min_group_size: number
  min_group_met: boolean
  booking_deadline: string | null
  supplier_confirmation_status: string
  status: string
  total_customer_payments: number
  payments_currency: string
  total_costs: number
  costs_currency: string
  revenue: number
  revenue_currency: string
  profit: number
  profit_currency: string
  supplier_id: string
  coordinator_id: string
  notes: string
  created_at: string
  updated_at: string
}

/**
 * Customer booking against a package/departure.
 * Links leads/deals to product ops — never stores package details only in lead notes.
 */
export interface CustomerBooking {
  id: string
  deal_id: string
  package_id: string
  departure_id: string
  supplier_id: string
  coordinator_id: string
  client_name: string
  lead_contact: string
  pax_count: number
  meal_tier: string
  selling_amount: number
  selling_currency: string
  cost_amount: number
  cost_currency: string
  margin_amount: number
  margin_pct: number
  deposit_status: string
  payment_status: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

/** Immutable accepted quote/terms snapshot. */
export interface WandersTermsAcceptance {
  id: string
  deal_id: string
  quote_ref: string
  terms_version: string
  terms_text: string
  accepted_at: string
  accepted_by: string
  acceptance_method: string
  created_by: string
  created_at: string
}
