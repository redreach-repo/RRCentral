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
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
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
