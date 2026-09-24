-- Vendor / supplier companies for uniform and other purchase invoices.
create table if not exists vendors (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  primary_contact text not null default '',
  email text not null default '',
  mobile text not null default '',
  office text not null default '',
  address text not null default '',
  trn text not null default '',
  website text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vendors_company_name_lower_idx
  on vendors (lower(company_name));

notify pgrst, 'reload schema';
