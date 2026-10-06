-- Company document vault (trade license, VAT certificate, etc.)
-- Files stay on Zoho WorkDrive; CRM stores share links + metadata. Admin-only.

create table if not exists public.company_documents (
  id uuid primary key default uuid_generate_v4(),
  category text not null default 'other'
    check (category in (
      'trade_license',
      'vat_certificate',
      'chamber_certificate',
      'insurance',
      'memorandum',
      'other'
    )),
  title text not null default '',
  file_name text not null default '',
  drive_url text not null default '',
  notes text not null default '',
  expires_on date,
  storage_provider text not null default 'zoho_workdrive',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_company_documents_category
  on public.company_documents (category);

create index if not exists idx_company_documents_expires
  on public.company_documents (expires_on);

alter table public.company_documents enable row level security;

drop policy if exists "Admins manage company documents" on public.company_documents;
create policy "Admins manage company documents" on public.company_documents
  for all to authenticated
  using (public.rr_is_admin())
  with check (public.rr_is_admin());

insert into public.app_settings (key, value)
values
  (
    'companyWorkDriveRootUrl',
    ''
  ),
  (
    'companyDocsHint',
    'Upload trade license, VAT certificate, and other company papers to Zoho WorkDrive, then paste the share link here. Files stay on WorkDrive — Central only stores the link.'
  )
on conflict (key) do nothing;
