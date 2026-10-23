export type UserRole = 'admin' | 'manager' | 'sales' | 'staff' | 'viewer'

export interface CrmContact {
  id: string
  name: string
  email: string
  phone: string
  role: string
}

export interface Client {
  id: string
  /** Linked account (RR Central modules). Null until linked. */
  account_id?: string | null
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

/** Supplier / vendor company (who you buy uniforms and other goods from). */
export interface Vendor {
  id: string
  company_name: string
  primary_contact: string
  email: string
  mobile: string
  office: string
  address: string
  trn: string
  website: string
  payment_terms: string
  notes: string
  active: boolean
  created_at: string
  updated_at: string
}

export type OwnedDomainStatus = 'active' | 'pending' | 'expired' | 'transferred' | 'parked'
export type OwnedDomainBillingCycle = '' | 'annual' | 'biennial' | 'other'

/** Domains the company owns (registrar / renewal / DNS tracker). */
export interface OwnedDomain {
  id: string
  domain_name: string
  registrar: string
  registrar_account: string
  status: OwnedDomainStatus
  registered_on: string | null
  expires_on: string | null
  auto_renew: boolean
  dns_provider: string
  nameservers: string
  hosting_provider: string
  website_url: string
  managed_by: string
  cost_aed: number | null
  billing_cycle: OwnedDomainBillingCycle
  notes: string
  active: boolean
  created_at: string
  updated_at: string
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
  /** Zoho WorkDrive folder URL for this customer's files (files stay on WorkDrive). */
  drive_folder_url?: string
  contacts?: CrmContact[]
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

/** File index for a customer folder — binaries live on Zoho WorkDrive. */
export type CustomerDocumentCategory =
  | 'quotation'
  | 'invoice'
  | 'delivery_note'
  | 'signed_quotation'
  | 'signed_invoice'
  | 'signed_delivery_note'
  | 'email'
  | 'whatsapp'
  | 'call_notes'
  | 'communication'
  /** @deprecated Kept so older WorkDrive rows still load. */
  | 'payment_slip'
  | 'supplier_invoice'
  | 'other'

export interface CustomerDocument {
  id: string
  company_name: string
  crm_id: string | null
  category: CustomerDocumentCategory
  title: string
  file_name: string
  drive_url: string
  related_ref: string
  notes: string
  storage_provider: string
  uploaded_by: string
  uploaded_at: string
}

/** Red Reach company papers (trade license, VAT cert, etc.) — WorkDrive links. */
export type CompanyDocumentCategory =
  | 'trade_license'
  | 'vat_certificate'
  | 'chamber_certificate'
  | 'insurance'
  | 'memorandum'
  | 'other'

export interface CompanyDocument {
  id: string
  category: CompanyDocumentCategory
  title: string
  file_name: string
  drive_url: string
  notes: string
  expires_on: string | null
  storage_provider: string
  uploaded_by: string
  uploaded_at: string
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
  /** Linked account (RR Central modules). Null until linked. */
  account_id?: string | null
  client: string
  vertical: string
  reference_number: string
  date: string | null
  description: string
  amount: number
  /** Percent discount off pre-VAT subtotal (0–100). */
  discount_percent: number
  /** Fixed discount amount off pre-VAT subtotal (quotation currency). */
  discount_amount: number
  /** Add VAT to the subtotal, then discount that VAT so the customer pays the ex-VAT amount. */
  offset_vat?: boolean
  status: string
  division_code: string
  base_reference: string
  revision: number
  /**
   * Shared deal key. Sibling “branch” quotes keep the same deal_ref so one
   * supplier invoice can cover several customer quotes (partial delivery).
   */
  deal_ref?: string
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
  /** Linked account (RR Central modules). Null until linked. */
  account_id?: string | null
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

/** Goods receipt / packing slip generated from a quotation. Quantities only — no prices. */
export interface DeliveryNote {
  id: string
  client: string
  vertical: string
  division_code: string
  reference_number: string
  date: string | null
  delivery_date: string | null
  description: string
  /** Finalized quotation reference this note is based on. */
  quote_ref: string
  quote_id: string
  status: string
  delivery_terms: string
  ship_to: string
  notes: string
  received_by: string
  vehicle_notes: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export type LineItemDocType = 'Quote' | 'Invoice' | 'DeliveryNote'

export interface LineItem {
  id: string
  doc_type: LineItemDocType
  reference: string
  line_no: number
  description: string
  qty: number
  unit_price: number
  /** Cost per unit (supplier / landed). Same currency as unit_price. */
  unit_cost: number
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
  /** Default cost when adding from catalog to a quote. */
  unit_cost: number
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
  /** VAT-inclusive total paid to the supplier (AED). */
  amount: number
  payment_method: string
  references_text: string
  notes: string
  /** Linked quotation reference (e.g. RR-01-26003) for COGS / profit. */
  quote_ref?: string
  /** Supplier tax invoice number. */
  supplier_invoice_no?: string
  /** Exclusive of VAT when known from the supplier invoice. */
  amount_ex_vat?: number | null
  /** Input VAT paid on the supplier invoice. */
  vat_amount?: number | null
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

/** Public website contact form → RR Central. */
export interface WebsiteInquiry {
  id: string
  name: string
  email: string
  phone: string
  vertical: string
  message: string
  status: 'new' | 'converted' | 'closed'
  crm_id: string
  created_at: string
}

/** Organisation Red Reach works with (RR Central modules). */
export type AccountType = 'ai_crm_client' | 'worship_church' | 'ctrm_prospect'

export interface Account {
  id: string
  type: AccountType
  name: string
  /** `AC-[code]-[YY][seq]`, e.g. AC-07-26001. */
  reference: string
  industry: string
  country: string
  city: string
  website: string
  status: string
  owner_user_id: string | null
  source: string
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface AccountContact {
  id: string
  account_id: string
  name: string
  role: string
  email: string
  phone: string
  whatsapp: string
  is_primary: boolean
  created_at: string
}

export type AccountActivityKind = 'note' | 'call' | 'email' | 'meeting' | 'system'

export interface AccountActivity {
  id: string
  account_id: string
  user_id: string | null
  user_email: string
  kind: AccountActivityKind
  body: string
  created_at: string
}

/** AI CRM package catalogue row (editable in Packages and rates). */
export interface DeliveryPackage {
  id: string
  code: string
  name: string
  monthly_fee_a: number
  setup_fee_b: number
  monthly_fee_b: number
  target_hours: number
  build_hours_target: number
  included_whatsapp: number
  support_response: string
  support_response_days: number
  ai_cap_usd: number | null
  included_lead_credits_usd: number | null
  tool_cost_aed: number
  sort: number
  active: boolean
  updated_at: string
}

export type ContractStatus = 'draft' | 'active' | 'ended' | 'cancelled'

export interface Contract {
  id: string
  account_id: string
  package_id: string | null
  option: 'A' | 'B'
  monthly_fee: number
  setup_fee: number
  setup_fee_paid: number
  term_start: string | null
  term_end: string | null
  discount_percent: number
  discount_months_left: number
  annual_prepay: boolean
  status: ContractStatus
  notes: string
  /** Raise the setup and monthly invoices automatically (as drafts). */
  auto_invoice?: boolean
  /** First month billed monthly (`YYYY-MM-01`). Null means the term start. */
  billing_from?: string | null
  created_at: string
  updated_at: string
}

export interface ContractInvoice {
  id: string
  contract_id: string
  account_id: string
  kind: 'setup' | 'monthly'
  period: string
  invoice_id: string | null
  generated_amount: number
  discount_applied: boolean
  created_at: string
}

export interface InvoiceReminder {
  id: string
  invoice_id: string
  stage: 3 | 7 | 14
  channel: 'email' | 'whatsapp' | 'other'
  sent_by: string
  sent_at: string
}

export type BuildStageKey =
  | 'discovery'
  | 'requirements_signed_off'
  | 'build'
  | 'whatsapp_setup'
  | 'testing'
  | 'live'

export type BuildStageStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'

export interface BuildStage {
  id: string
  account_id: string
  stage: BuildStageKey
  status: BuildStageStatus
  owner_user_id: string | null
  due_date: string | null
  blocker_note: string
  completed_at: string | null
  created_at: string
}

export type RequirementStatus = 'open' | 'agreed' | 'built' | 'changed'

export interface Requirement {
  id: string
  account_id: string
  title: string
  detail: string
  status: RequirementStatus
  source: string
  is_change_request: boolean
  created_by: string
  created_at: string
}

export type TimeCategory = 'build' | 'support' | 'reporting' | 'leads' | 'content' | 'admin'

export interface TimeEntry {
  id: string
  account_id: string
  user_id: string | null
  user_email: string
  date: string
  hours: number
  category: TimeCategory
  note: string
  /** Set when the hours were logged with a ticket reply. */
  ticket_id?: string | null
  created_at: string
}

export interface UsageRecord {
  id: string
  account_id: string
  /** First day of the month, YYYY-MM-01. */
  month: string
  whatsapp_marketing_count: number
  whatsapp_service_count: number
  ai_cost_usd: number
  lead_credits_cost_usd: number
  updated_at: string
  /** When the usage import last wrote this row. */
  imported_at?: string | null
}

/** Where a client's usage comes from, for the daily import. */
export interface UsageSourceRow {
  id: string
  account_id: string
  whatsapp_phones: string[]
  ai_workspace_id: string
  updated_by: string
  updated_at: string
}

export interface UsageImportRun {
  id: string
  started_at: string
  finished_at: string | null
  trigger: 'manual' | 'schedule'
  requested_by: string
  whatsapp_status: string
  ai_status: string
  rows_written: number
  message: string
}

export type SalesStage = 'lead' | 'discovery_call' | 'quote_sent' | 'signed' | 'lost'

/** An AI CRM prospect in the pre-sale pipeline, with the quote on it. */
export interface SalesDeal {
  id: string
  account_id: string
  stage: SalesStage
  source: string
  owner_user_id: string | null
  next_action: string
  next_action_date: string | null
  lost_reason: string
  notes: string
  /** Date of the discovery call, booked or held. */
  discovery_call_date: string | null
  /** The quote: package, option and fees, excluding VAT. */
  package_id: string | null
  option: 'A' | 'B'
  monthly_fee: number
  setup_fee: number
  discount_percent: number
  discount_months: number
  /** Agreed contract start. Null means the first of next month. */
  start_date: string | null
  /** An RR quotation number, if a formal quotation was sent. */
  quote_reference: string
  quote_sent_at: string | null
  /** Set when Make contract created the client's contract. */
  contract_id: string | null
  signed_at: string | null
  last_touch_at: string
  created_by: string
  created_at: string
  updated_at: string
}

/** One AI request made from RR Central, logged against the account (ai_usage_log). */
export interface AiUsageLog {
  id: string
  account_id: string
  feature: 'ticket_summary' | 'ticket_reply' | 'report_summary' | 'call_notes'
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_by: string
  created_at: string
}

/** A private client portal link. Only the token's hash is stored. */
export interface PortalAccess {
  id: string
  account_id: string
  contact_id: string | null
  label: string
  token_hash: string
  created_by: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
}

/** Someone on the daily digest list. */
export interface DigestRecipientRow {
  id: string
  name: string
  email: string
  /** Digits only, e.g. 971501234567. */
  whatsapp_phone: string
  by_email: boolean
  by_whatsapp: boolean
  active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface DigestRun {
  id: string
  run_date: string
  started_at: string
  finished_at: string | null
  trigger: 'manual' | 'schedule'
  requested_by: string
  item_count: number
  emails_sent: number
  whatsapp_sent: number
  email_status: string
  whatsapp_status: string
  message: string
}

export type TicketChannel = 'email' | 'whatsapp' | 'phone' | 'in_person' | 'internal'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TicketStatus = 'new' | 'open' | 'waiting_on_client' | 'resolved' | 'closed'

export interface Ticket {
  id: string
  /** Null for email from an unknown sender until someone files it on an account. */
  account_id: string | null
  contact_id: string | null
  requester_email: string
  subject: string
  channel: TicketChannel
  priority: TicketPriority
  status: TicketStatus
  assignee_user_id: string | null
  /** Working hours allowed for the first reply, copied from the policy at creation. */
  sla_hours: number
  sla_due_at: string | null
  first_response_at: string | null
  resolved_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  author_kind: 'user' | 'contact'
  author_user_id: string | null
  author_label: string
  body: string
  is_internal_note: boolean
  /** Email Message-ID for threading inbound replies. */
  external_id: string
  created_at: string
}

/** First response time in working hours, per package or per account type. */
export interface SlaPolicy {
  id: string
  applies_to: 'package' | 'account_type'
  package_id: string | null
  account_type: AccountType | null
  label: string
  first_response_hours: number
  updated_at: string
}

export type CtrmStage =
  | 'identified'
  | 'contacted'
  | 'intro_call_booked'
  | 'demo_done'
  | 'evaluating'
  | 'decision_pending'
  | 'signed'
  | 'lost'

export type CtrmRegion = 'middle_east' | 'india'
export type CtrmCompanyType = 'trading_house' | 'energy' | 'other'

/** A prospect being introduced to CTRM Next. Commission lives in CtrmCommission. */
export interface CtrmDeal {
  id: string
  account_id: string
  stage: CtrmStage
  region: CtrmRegion
  company_type: CtrmCompanyType
  primary_contact_id: string | null
  source: string
  owner_user_id: string | null
  last_touch_at: string
  next_action: string
  next_action_date: string | null
  lost_reason: string
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface CtrmStageChange {
  id: string
  deal_id: string
  from_stage: string
  to_stage: CtrmStage
  changed_by: string
  changed_at: string
}

/** Commission owed to Red Reach (the company) for a deal. Admin, manager and sales only. */
export interface CtrmCommission {
  id: string
  deal_id: string
  expected_commission: number
  commission_received: number
  currency: string
  updated_at: string
}

/** WorshipHub billing state for a church, as WorshipHub reports it. */
export type WorshipBillingStatus = '' | 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled'

/** Account level details for a WorshipHub church, entered by hand in RR Central. */
export interface WorshipChurchProfile {
  id: string
  account_id: string
  tenant_slug: string
  plan: string
  modules: string[]
  /** YYYY-MM */
  whatsapp_month: string
  whatsapp_conversations: number | null
  billing_status: WorshipBillingStatus
  renewal_date: string | null
  admin_url: string
  notes: string
  updated_by: string
  created_at: string
  updated_at: string
}

/** One tenant as read live from WorshipHub. Only these fields ever reach RR Central. */
export interface WorshipTenant {
  slug: string
  name: string
  plan: string
  modules: string[]
  whatsapp_month: string
  whatsapp_marketing: number
  whatsapp_service: number
  whatsapp_utility: number
  billing_status: WorshipBillingStatus
  renewal_date: string | null
  admin_url: string
}
