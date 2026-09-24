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

-- Match other CRM tables: RLS on + allow signed-in (and anon key) access.
alter table vendors enable row level security;

drop policy if exists "Authenticated users full access" on vendors;
create policy "Authenticated users full access" on vendors
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Anon full access" on vendors;
create policy "Anon full access" on vendors
  for all using (auth.role() = 'anon')
  with check (auth.role() = 'anon');

notify pgrst, 'reload schema';
