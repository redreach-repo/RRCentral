-- M11: business-type → industry pack map + idempotent workspace provision log.

create table if not exists public.business_type_packs (
  id uuid primary key default gen_random_uuid(),
  business_type text not null unique,
  pack_key text not null,
  label text not null default '',
  description text not null default '',
  created_at timestamptz not null default now()
);

insert into public.business_type_packs (business_type, pack_key, label, description) values
  ('services', 'uae_services', 'Professional services', 'VAT-aware quoting starter'),
  ('church_saas', 'church_saas', 'Church / worship SaaS', 'WorshipHub-oriented delivery'),
  ('trading', 'trading_import', 'Trading / import', 'SKU and supplier hints'),
  ('events', 'events_tours', 'Events & tours', 'Itinerary-oriented sales'),
  ('engineering', 'engineering', 'Engineering', 'Projects and document registers'),
  ('construction', 'construction', 'Construction', 'Sites, workforce, materials')
on conflict (business_type) do nothing;

create table if not exists public.workspace_provision_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  business_type text not null,
  workspace_name text not null,
  admin_email text not null,
  status text not null default 'received'
    check (status in ('received', 'provisioned', 'failed')),
  tenant_id uuid references public.tenants (id) on delete set null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists workspace_provision_requests_created_idx
  on public.workspace_provision_requests (created_at desc);

alter table public.business_type_packs enable row level security;
alter table public.workspace_provision_requests enable row level security;
revoke all on public.business_type_packs from anon, authenticated;
revoke all on public.workspace_provision_requests from anon, authenticated;
grant select on public.business_type_packs to authenticated, anon;
grant select on public.workspace_provision_requests to authenticated;

drop policy if exists "Anyone read business_type_packs" on public.business_type_packs;
create policy "Anyone read business_type_packs" on public.business_type_packs
  for select to anon, authenticated
  using (true);

drop policy if exists "Admins read workspace_provision_requests" on public.workspace_provision_requests;
create policy "Admins read workspace_provision_requests" on public.workspace_provision_requests
  for select to authenticated
  using (public.rr_is_admin());

comment on table public.business_type_packs is 'M11: maps sign-up business type to industry pack_key.';
comment on table public.workspace_provision_requests is 'M11: idempotent provision audit; Edge writes with service role.';
