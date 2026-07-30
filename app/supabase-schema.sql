-- RED REACH Central — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";

------------------------------------------------------------
-- APP SETTINGS (key-value config)
------------------------------------------------------------
create table app_settings (
  key text primary key,
  value text not null default ''
);

insert into app_settings (key, value) values
  ('companyName', 'Red Reach Middle East FZE'),
  ('brand', 'RED REACH'),
  ('tagline', 'Multi-division commerce · UAE'),
  ('address', 'P.O. Box 6641, Dubai, UAE'),
  ('email', 'info@redreach.ae'),
  ('phone', ''),
  ('website', 'www.redreach.ae'),
  ('trn', ''),
  ('accountName', 'Red Reach Middle East FZE'),
  ('bankName', 'Mashreq Bank'),
  ('bankAccount', '019100599735'),
  ('iban', 'AE230330000019100599735'),
  ('swift', ''),
  ('paymentTerms', 'Immediate upon delivery'),
  ('paymentMethod', 'Cheque or Bank Transfer'),
  ('quoteClosing', 'Thanking you and looking forward to do business with you.'),
  ('quoteTerms', 'Prices valid for quantities mentioned. Subject to availability at time of order.'),
  ('deliveryTerms', '2 weeks once the advance payment is received'),
  ('moqTerms', 'Unit prices are based on MOQ of 50 pcs per style per colour. Prices may vary for lower quantities.'),
  ('vatRate', '0.05'),
  ('currency', 'AED'),
  ('quotePrefix', 'RR'),
  ('invoicePrefix', 'RR'),
  ('quoteValidityDays', '14'),
  ('moqDefault', '50'),
  ('logoUrl', ''),
  ('portalBaseUrl', ''),
  ('bilingualDefault', 'en'),
  ('whatsappCountryCode', '971'),
  ('followUpDaysAfterQuote', '3'),
  ('calendarSync', 'yes'),
  ('calendarId', 'primary');

------------------------------------------------------------
-- APP USERS (roles & access)
------------------------------------------------------------
create table app_users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text not null default '',
  role text not null default 'sales' check (role in ('admin', 'sales')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed admin users
insert into app_users (email, name, role) values
  ('alfredsv@gmail.com', 'Alfred', 'admin'),
  ('redreachdxb@gmail.com', 'Red Reach DXB', 'admin'),
  ('alfred@redreach.ae', 'Alfred', 'admin'),
  ('jacob@redreach.ae', 'Jacob', 'admin');

------------------------------------------------------------
-- CLIENTS
------------------------------------------------------------
create table clients (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  primary_contact text not null default '',
  email text not null default '',
  mobile text not null default '',
  office text not null default '',
  address text not null default '',
  trn text not null default '',
  website text not null default '',
  company_owner text not null default '',
  notes text not null default '',
  contacts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- CRM (Sales Visits / Contacts)
------------------------------------------------------------
create table crm (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  primary_contact text not null default '',
  email_phone text not null default '',
  mobile_number text not null default '',
  office_number text not null default '',
  notes text not null default '',
  follow_up_date date,
  next_action text not null default '',
  owner text not null default '',
  company_owner text not null default '',
  address text not null default '',
  website text not null default '',
  trn text not null default '',
  pipeline_stage text not null default 'Lead',
  quote_ref text not null default '',
  outcome_reason text not null default '',
  calendar_event_id text not null default '',
  contacts jsonb not null default '[]'::jsonb,
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- FOLLOW-UP UPDATES
------------------------------------------------------------
create table follow_up_updates (
  id uuid primary key default uuid_generate_v4(),
  crm_id uuid references crm(id) on delete cascade,
  company text not null default '',
  update_text text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- QUOTATIONS
------------------------------------------------------------
create table quotations (
  id uuid primary key default uuid_generate_v4(),
  client text not null default '',
  vertical text not null default '',
  reference_number text not null default '',
  date date,
  description text not null default '',
  amount numeric(12,2) not null default 0,
  status text not null default 'Draft',
  division_code text not null default '01',
  base_reference text not null default '',
  revision integer not null default 0,
  quote_id text not null default '',
  payment_terms text not null default '',
  moq text not null default '',
  notes text not null default '',
  delivery_terms text not null default '',
  outcome_reason text not null default '',
  valid_until date,
  currency text not null default 'AED',
  quotation_currency text not null default 'AED',
  payment_currency text not null default 'AED',
  supplier_currency text not null default 'AED',
  booking_currency text not null default 'AED',
  fx_rate numeric(18,8) not null default 1,
  fx_rate_date date,
  fx_rate_approved_by text not null default '',
  fx_rate_approved_at timestamptz,
  base_amount numeric(14,2) not null default 0,
  conversion_fee_estimate numeric(12,2) not null default 0,
  bank_fee_estimate numeric(12,2) not null default 0,
  charges_borne_by text not null default 'Customer',
  net_amount_required text not null default '',
  accept_other_payment_currency boolean not null default true,
  rate_valid_until date,
  payment_instructions text not null default '',
  supplier_cost_base numeric(14,2) not null default 0,
  estimated_gross_profit_base numeric(14,2) not null default 0,
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- CUSTOMER PAYMENTS (multi-currency — original FC amount immutable)
------------------------------------------------------------
create table customer_payments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid,
  quote_ref text not null default '',
  invoice_ref text not null default '',
  client text not null default '',
  payment_date date,
  amount_received numeric(14,2) not null default 0,
  currency text not null default 'AED',
  fx_rate numeric(18,8) not null default 1,
  fx_rate_date date,
  fx_rate_approved_by text not null default '',
  base_amount numeric(14,2) not null default 0,
  payment_method text not null default '',
  bank_provider text not null default '',
  processing_fee numeric(12,2) not null default 0,
  conversion_fee numeric(12,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  payment_type text not null default 'Deposit',
  transaction_ref text not null default '',
  proof_url text not null default '',
  status text not null default 'Pending',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- CUSTOMER REFUNDS
------------------------------------------------------------
create table customer_refunds (
  id uuid primary key default uuid_generate_v4(),
  payment_id uuid,
  booking_id uuid,
  quote_ref text not null default '',
  client text not null default '',
  refund_date date,
  original_currency text not null default 'AED',
  original_amount_received numeric(14,2) not null default 0,
  refund_currency text not null default 'AED',
  amount_refunded numeric(14,2) not null default 0,
  fx_rate numeric(18,8) not null default 1,
  fx_rate_date date,
  conversion_fee numeric(12,2) not null default 0,
  bank_fee numeric(12,2) not null default 0,
  base_amount numeric(14,2) not null default 0,
  fx_gain_loss numeric(14,2) not null default 0,
  reason text not null default '',
  approved_by text not null default '',
  approved_at timestamptz,
  status text not null default 'Refunded',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- SUPPLIER COMMITMENTS (original currency preserved)
------------------------------------------------------------
create table supplier_commitments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid,
  quote_ref text not null default '',
  supplier_name text not null default '',
  description text not null default '',
  amount numeric(14,2) not null default 0,
  currency text not null default 'AED',
  fx_rate numeric(18,8) not null default 1,
  fx_rate_date date,
  base_amount numeric(14,2) not null default 0,
  status text not null default 'Open',
  due_date date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- FX RATE APPROVAL LOG (historical rates never auto-change)
------------------------------------------------------------
create table fx_rates (
  id uuid primary key default uuid_generate_v4(),
  from_currency text not null default 'AED',
  to_currency text not null default 'AED',
  rate numeric(18,8) not null default 1,
  rate_date date not null,
  source text not null default 'manual',
  approved_by text not null default '',
  approved_at timestamptz not null default now(),
  notes text not null default '',
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- INVOICES
------------------------------------------------------------
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  client text not null default '',
  vertical text not null default '',
  reference_number text not null default '',
  date date,
  description text not null default '',
  amount numeric(12,2) not null default 0,
  status text not null default 'Draft',
  payment_status text not null default 'Pending',
  payment_terms text not null default '',
  moq text not null default '',
  notes text not null default '',
  delivery_terms text not null default '',
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- LINE ITEMS (shared by quotes & invoices)
------------------------------------------------------------
create table line_items (
  id uuid primary key default uuid_generate_v4(),
  doc_type text not null check (doc_type in ('Quote', 'Invoice')),
  reference text not null,
  line_no integer not null default 1,
  description text not null default '',
  qty numeric(10,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  vat_rate numeric(5,4) not null default 0.05,
  amount numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  remarks text not null default '',
  sku text not null default '',
  sizes_json jsonb,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- PRODUCT CATALOG
------------------------------------------------------------
create table products (
  id uuid primary key default uuid_generate_v4(),
  sku text not null default '',
  name text not null,
  division_code text not null default '01',
  unit_price numeric(12,2) not null default 0,
  moq integer not null default 50,
  fabric text not null default '',
  unit text not null default 'pcs',
  active boolean not null default true,
  notes text not null default '',
  stock_on_hand numeric(12,2) not null default 0,
  stock_reserved numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 20,
  track_sizes boolean not null default false,
  size_stock jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- INVENTORY MOVEMENTS
------------------------------------------------------------
create table inventory_movements (
  id uuid primary key default uuid_generate_v4(),
  sku text not null default '',
  qty_delta numeric(12,2) not null default 0,
  reserved_delta numeric(12,2) not null default 0,
  reason text not null default '',
  reference text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- QUOTE TEMPLATES
------------------------------------------------------------
create table quote_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  division_code text not null default '01',
  description text not null default '',
  items_json jsonb not null default '[]',
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- INCOME
------------------------------------------------------------
create table income (
  id uuid primary key default uuid_generate_v4(),
  client_source text not null default '',
  category text not null default '',
  reference_number text not null default '',
  date date,
  description text not null default '',
  bill_amount numeric(12,2) not null default 0,
  vat numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null default '',
  payment_method text not null default '',
  payment_status text not null default ''
);

------------------------------------------------------------
-- EXPENSES
------------------------------------------------------------
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  date date,
  vendor text not null default '',
  category text not null default '',
  amount numeric(12,2) not null default 0,
  payment_method text not null default '',
  references_text text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- PAYMENT LOG
------------------------------------------------------------
create table payment_log (
  id uuid primary key default uuid_generate_v4(),
  invoice_ref text not null default '',
  client text not null default '',
  amount numeric(12,2) not null default 0,
  method text not null default '',
  notes text not null default '',
  user_email text not null default '',
  balance_after numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- ATTACHMENTS
------------------------------------------------------------
create table attachments (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null default '',
  entity_ref text not null default '',
  file_name text not null default '',
  storage_path text not null default '',
  url text not null default '',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now()
);

------------------------------------------------------------
-- ACTIVITY LOG
------------------------------------------------------------
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  action text not null default '',
  entity text not null default '',
  reference text not null default '',
  details text not null default '',
  user_email text not null default '',
  crm_id uuid references crm(id) on delete set null,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- INDEXES
------------------------------------------------------------
create index idx_crm_follow_up on crm(follow_up_date);
create index idx_crm_owner on crm(owner);
create index idx_quotations_status on quotations(status);
create index idx_quotations_reference on quotations(reference_number);
create index idx_quotations_division on quotations(division_code);
create index idx_invoices_status on invoices(status);
create index idx_invoices_payment_status on invoices(payment_status);
create index idx_invoices_reference on invoices(reference_number);
create index idx_line_items_ref on line_items(doc_type, reference);
create index idx_payment_log_invoice on payment_log(invoice_ref);
create index idx_activity_log_entity on activity_log(entity, reference);
create index idx_attachments_entity on attachments(entity_type, entity_ref);
create index idx_income_date on income(date);
create index idx_expenses_date on expenses(date);
create index idx_customer_payments_booking on customer_payments(booking_id);
create index idx_customer_refunds_booking on customer_refunds(booking_id);
create index idx_supplier_commitments_booking on supplier_commitments(booking_id);
create index idx_fx_rates_pair_date on fx_rates(from_currency, to_currency, rate_date);

------------------------------------------------------------
-- ROW LEVEL SECURITY (all tables readable/writable by authenticated users)
------------------------------------------------------------
alter table app_settings enable row level security;
alter table app_users enable row level security;
alter table clients enable row level security;
alter table crm enable row level security;
alter table follow_up_updates enable row level security;
alter table quotations enable row level security;
alter table invoices enable row level security;
alter table line_items enable row level security;
alter table products enable row level security;
alter table quote_templates enable row level security;
alter table income enable row level security;
alter table expenses enable row level security;
alter table payment_log enable row level security;
alter table attachments enable row level security;
alter table activity_log enable row level security;
alter table inventory_movements enable row level security;
alter table customer_payments enable row level security;
alter table customer_refunds enable row level security;
alter table supplier_commitments enable row level security;
alter table fx_rates enable row level security;

-- Allow all authenticated users to read/write all tables
-- (app-level role checks handle admin vs sales permissions)
create policy "Authenticated users full access" on app_settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on app_users for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on clients for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on crm for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on follow_up_updates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on quotations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on invoices for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on line_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on products for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on quote_templates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on income for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on expenses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on payment_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on attachments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on activity_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on inventory_movements for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on customer_payments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on customer_refunds for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on supplier_commitments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated users full access" on fx_rates for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

------------------------------------------------------------
-- Optional upgrades for existing databases (run once if upgrading)
------------------------------------------------------------
-- alter table crm add column if not exists contacts jsonb not null default '[]'::jsonb;
-- alter table clients add column if not exists contacts jsonb not null default '[]'::jsonb;
-- alter table crm add column if not exists company_owner text not null default '';
-- alter table crm add column if not exists address text not null default '';
-- alter table crm add column if not exists website text not null default '';
-- alter table crm add column if not exists trn text not null default '';
-- alter table crm add column if not exists pipeline_stage text not null default 'Lead';
-- alter table crm add column if not exists outcome_reason text not null default '';
-- alter table activity_log add column if not exists crm_id uuid references crm(id) on delete set null;
-- alter table clients add column if not exists company_owner text not null default '';
-- alter table clients add column if not exists website text not null default '';
-- alter table quotations add column if not exists valid_until date;
-- alter table products add column if not exists stock_on_hand numeric(12,2) not null default 0;
-- alter table products add column if not exists stock_reserved numeric(12,2) not null default 0;
-- alter table products add column if not exists reorder_level numeric(12,2) not null default 20;
-- alter table products add column if not exists track_sizes boolean not null default false;
-- alter table products add column if not exists size_stock jsonb not null default '{}'::jsonb;
-- alter table line_items add column if not exists sku text not null default '';
-- alter table line_items add column if not exists sizes_json jsonb;
-- create table if not exists inventory_movements (
--   id uuid primary key default uuid_generate_v4(),
--   sku text not null default '',
--   qty_delta numeric(12,2) not null default 0,
--   reserved_delta numeric(12,2) not null default 0,
--   reason text not null default '',
--   reference text not null default '',
--   user_email text not null default '',
--   created_at timestamptz not null default now()
-- );
-- alter table quotations add column if not exists currency text not null default 'AED';
-- alter table quotations add column if not exists quotation_currency text not null default 'AED';
-- alter table quotations add column if not exists payment_currency text not null default 'AED';
-- alter table quotations add column if not exists supplier_currency text not null default 'AED';
-- alter table quotations add column if not exists booking_currency text not null default 'AED';
-- alter table quotations add column if not exists fx_rate numeric(18,8) not null default 1;
-- alter table quotations add column if not exists fx_rate_date date;
-- alter table quotations add column if not exists fx_rate_approved_by text not null default '';
-- alter table quotations add column if not exists fx_rate_approved_at timestamptz;
-- alter table quotations add column if not exists base_amount numeric(14,2) not null default 0;
-- alter table quotations add column if not exists conversion_fee_estimate numeric(12,2) not null default 0;
-- alter table quotations add column if not exists bank_fee_estimate numeric(12,2) not null default 0;
-- alter table quotations add column if not exists charges_borne_by text not null default 'Customer';
-- alter table quotations add column if not exists net_amount_required text not null default '';
-- alter table quotations add column if not exists accept_other_payment_currency boolean not null default true;
-- alter table quotations add column if not exists rate_valid_until date;
-- alter table quotations add column if not exists payment_instructions text not null default '';
-- alter table quotations add column if not exists supplier_cost_base numeric(14,2) not null default 0;
-- alter table quotations add column if not exists estimated_gross_profit_base numeric(14,2) not null default 0;
