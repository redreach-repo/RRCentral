-- M8a: country packs as data (UAE / India / Canada starters).
-- Rule payloads are Unverified — see docs/COMPLIANCE_NOTES.md.

create table if not exists public.country_packs (
  id uuid primary key default gen_random_uuid(),
  pack_key text not null unique,
  name text not null,
  country_code text not null check (char_length(country_code) = 2),
  currency text not null default 'AED',
  description text not null default '',
  version text not null default '0.1.0',
  -- JSON: taxIdLabel, leaveTypes, payrollHints, notes — all Unverified until counsel.
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_country_packs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  pack_id uuid not null references public.country_packs (id) on delete cascade,
  status text not null default 'available'
    check (status in ('available', 'active', 'retired')),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, pack_id)
);

create index if not exists tenant_country_packs_tenant_idx
  on public.tenant_country_packs (tenant_id, status);

insert into public.country_packs (pack_key, name, country_code, currency, description, rules) values
(
  'ae',
  'United Arab Emirates',
  'AE',
  'AED',
  'Starter UAE pack: VAT label + WPS hints. Unverified.',
  '{
    "taxIdLabel": "TRN",
    "vatRateHint": 0.05,
    "leaveTypes": ["annual", "sick", "unpaid"],
    "payrollHints": ["WPS SIF draft only — not bank-certified"],
    "verification": "Unverified"
  }'::jsonb
),
(
  'in',
  'India',
  'IN',
  'INR',
  'Starter India pack: GSTIN label placeholders. Unverified — not payroll advice.',
  '{
    "taxIdLabel": "GSTIN",
    "vatRateHint": null,
    "leaveTypes": ["earned", "sick", "casual"],
    "payrollHints": ["PF/ESI/TDS not calculated in this pack"],
    "verification": "Unverified"
  }'::jsonb
),
(
  'ca',
  'Canada',
  'CA',
  'CAD',
  'Starter Canada pack: GST/HST label placeholders. Unverified — not payroll advice.',
  '{
    "taxIdLabel": "BN / GST-HST",
    "vatRateHint": null,
    "leaveTypes": ["vacation", "sick", "unpaid"],
    "payrollHints": ["CPP/EI/provincial tax not calculated in this pack"],
    "verification": "Unverified"
  }'::jsonb
)
on conflict (pack_key) do nothing;

alter table public.country_packs enable row level security;
alter table public.tenant_country_packs enable row level security;
revoke all on public.country_packs from anon, authenticated;
revoke all on public.tenant_country_packs from anon, authenticated;
grant select on public.country_packs to authenticated;
grant select, insert, update, delete on public.tenant_country_packs to authenticated;

drop policy if exists "Staff read country_packs" on public.country_packs;
create policy "Staff read country_packs" on public.country_packs
  for select to authenticated using (public.rr_is_staff());

drop policy if exists "Admins write country_packs" on public.country_packs;
create policy "Admins write country_packs" on public.country_packs
  for all to authenticated
  using (public.rr_is_admin())
  with check (public.rr_is_admin());

drop policy if exists "Members read tenant_country_packs" on public.tenant_country_packs;
create policy "Members read tenant_country_packs" on public.tenant_country_packs
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write tenant_country_packs" on public.tenant_country_packs;
create policy "Admins write tenant_country_packs" on public.tenant_country_packs
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Tenant isolation" on public.tenant_country_packs;
create policy "Tenant isolation" on public.tenant_country_packs
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.country_packs;
drop policy if exists "Viewers read" on public.country_packs;
drop policy if exists "Staff full access" on public.tenant_country_packs;
drop policy if exists "Viewers read" on public.tenant_country_packs;

comment on table public.country_packs is 'M8a: country rule packs (data). Rules JSON Unverified until counsel.';
comment on table public.tenant_country_packs is 'M8a: which country packs a tenant activated.';
