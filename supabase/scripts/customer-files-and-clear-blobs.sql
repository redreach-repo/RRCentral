-- Paste this into the Supabase SQL editor (SQL only — not TypeScript from the app).
-- Sets up Customer files / WorkDrive + clears old supplier invoice PDF blobs.

alter table crm
  add column if not exists drive_folder_url text not null default '';

create table if not exists customer_documents (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null default '',
  crm_id uuid references crm(id) on delete set null,
  category text not null default 'other',
  title text not null default '',
  file_name text not null default '',
  drive_url text not null default '',
  related_ref text not null default '',
  notes text not null default '',
  storage_provider text not null default 'zoho_workdrive',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now()
);

alter table customer_documents
  alter column storage_provider set default 'zoho_workdrive';

create index if not exists idx_customer_documents_company
  on customer_documents (lower(company_name));

create index if not exists idx_customer_documents_crm
  on customer_documents (crm_id);

create index if not exists idx_customer_documents_category
  on customer_documents (category);

alter table customer_documents enable row level security;

drop policy if exists "Authenticated users full access" on customer_documents;
create policy "Authenticated users full access" on customer_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Anon users full access" on customer_documents;
create policy "Anon users full access" on customer_documents
  for all using (auth.role() = 'anon') with check (auth.role() = 'anon');

insert into app_settings (key, value)
values
  ('customerWorkDriveRootUrl', ''),
  ('customerDriveRootUrl', ''),
  ('customerDriveHint', 'Create one Zoho WorkDrive folder per customer. Upload payment slips and signed DNs there, then paste the share link into Customer files in the CRM.')
on conflict (key) do nothing;

-- Clear old supplier invoice PDF blobs from Supabase (keeps expense metadata)
delete from attachments
where entity_type = 'quotation_supplier_invoice'
  and url like 'data:%';

delete from attachments
where entity_type = 'expense'
  and url like 'data:%'
  and (
    lower(coalesce(file_name, '')) like '%.pdf'
    or lower(coalesce(file_name, '')) like '%invoice%'
  );
