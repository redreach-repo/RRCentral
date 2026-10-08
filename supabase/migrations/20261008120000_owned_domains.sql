-- Tracker for domains the company owns (registrar, renewals, DNS/hosting).
create table if not exists public.owned_domains (
  id uuid primary key default uuid_generate_v4(),
  domain_name text not null,
  registrar text not null default '',
  registrar_account text not null default '',
  status text not null default 'active'
    check (status in ('active', 'pending', 'expired', 'transferred', 'parked')),
  registered_on date,
  expires_on date,
  auto_renew boolean not null default false,
  dns_provider text not null default '',
  nameservers text not null default '',
  hosting_provider text not null default '',
  website_url text not null default '',
  managed_by text not null default '',
  cost_aed numeric(12, 2),
  billing_cycle text not null default ''
    check (billing_cycle in ('', 'annual', 'biennial', 'other')),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists owned_domains_name_lower_idx
  on public.owned_domains (lower(domain_name));

create index if not exists owned_domains_expires_idx
  on public.owned_domains (expires_on)
  where active = true;

alter table public.owned_domains enable row level security;

grant select, insert, update, delete on public.owned_domains to authenticated;
grant select, insert, update, delete on public.owned_domains to anon;

drop policy if exists "Authenticated users full access" on public.owned_domains;
create policy "Authenticated users full access" on public.owned_domains
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists "Anon full access" on public.owned_domains;
create policy "Anon full access" on public.owned_domains
  for all to anon
  using (true)
  with check (true);

notify pgrst, 'reload schema';
