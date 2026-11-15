-- M11: per-host / per-company app identity rows (manifest metadata).

create table if not exists public.tenant_app_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  company_id uuid references public.companies (id) on delete set null,
  -- Host slug only (e.g. alnoor); full host = slug || '.highmast.app' when live.
  host_slug text not null,
  display_name text not null default '',
  short_name text not null default '',
  primary_color text not null default '#c8321a',
  background_color text not null default '#ffffff',
  mark_url text not null default '',
  start_path text not null default '/RRCentral/app',
  lang text not null default 'en',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (host_slug),
  constraint tenant_app_identities_slug_format check (host_slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
);

create index if not exists tenant_app_identities_tenant_idx
  on public.tenant_app_identities (tenant_id, active);

alter table public.tenant_app_identities enable row level security;
revoke all on public.tenant_app_identities from anon, authenticated;
grant select, insert, update, delete on public.tenant_app_identities to authenticated;

drop policy if exists "Members read tenant_app_identities" on public.tenant_app_identities;
create policy "Members read tenant_app_identities" on public.tenant_app_identities
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write tenant_app_identities" on public.tenant_app_identities;
create policy "Admins write tenant_app_identities" on public.tenant_app_identities
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Tenant isolation" on public.tenant_app_identities;
create policy "Tenant isolation" on public.tenant_app_identities
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.tenant_app_identities;
drop policy if exists "Viewers read" on public.tenant_app_identities;

comment on table public.tenant_app_identities is 'M11: workspace app identity / host slug for PWA install (DNS later).';
