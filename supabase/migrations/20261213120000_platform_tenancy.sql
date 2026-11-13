-- RRCRM M1 — platform tenancy foundation
--
-- Adds tenants / companies / business_units / brand_kits, seeds Red Reach as
-- tenant one, stamps every existing public business table with tenant_id, and
-- enforces isolation with RESTRICTIVE RLS policies (existing policies stay).
--
-- Safe for a single-tenant production: all current rows backfill to Red Reach.
-- Cross-tenant isolation is covered by supabase/tests/tenant_isolation_test.sql.

------------------------------------------------------------
-- Fixed ids for the private Red Reach tenant (tenant number one)
------------------------------------------------------------
-- tenant  a0000000-0000-4000-8000-000000000001
-- company a0000000-0000-4000-8000-000000000002

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active'
    check (status in ('active', 'trial', 'suspended', 'cancelled')),
  is_demo boolean not null default false,
  expires_at timestamptz,
  plan_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  legal_name text not null default '',
  jurisdiction text not null default 'uae_mainland',
  trn text not null default '',
  currency text not null default 'AED',
  fiscal_year_start_month int not null default 1
    check (fiscal_year_start_month between 1 and 12),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_tenant_idx on public.companies (tenant_id);

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists business_units_company_idx on public.business_units (company_id);

-- Brand kit: JSON document + asset paths (Storage or public URLs).
create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  business_unit_id uuid references public.business_units (id) on delete cascade,
  primary_color text not null default '#C8321A',
  accent_color text not null default '#E8872A',
  neutral_dark text not null default '#1A1A1A',
  neutral_light text not null default '#FFFFFF',
  logo_horizontal_path text,
  logo_light_path text,
  mark_square_path text,
  legal_footer text not null default '',
  fonts jsonb not null default '{}'::jsonb,
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (company_id is null and business_unit_id is null)
    or (company_id is not null)
  )
);

create unique index if not exists brand_kits_tenant_default_uidx
  on public.brand_kits (tenant_id)
  where company_id is null and business_unit_id is null;

create unique index if not exists brand_kits_company_uidx
  on public.brand_kits (tenant_id, company_id)
  where company_id is not null and business_unit_id is null;

create unique index if not exists brand_kits_bu_uidx
  on public.brand_kits (tenant_id, business_unit_id)
  where business_unit_id is not null;

------------------------------------------------------------
-- Seed Red Reach (private operations tenant)
------------------------------------------------------------
insert into public.tenants (id, name, slug, status, is_demo)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Red Reach Middle East FZE',
  'redreach',
  'active',
  false
)
on conflict (id) do nothing;

insert into public.companies (
  id, tenant_id, name, legal_name, jurisdiction, trn, currency, is_default
)
values (
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'Red Reach Middle East FZE',
  'Red Reach Middle East FZE',
  'uae_free_zone',
  '',
  'AED',
  true
)
on conflict (id) do nothing;

insert into public.business_units (id, tenant_id, company_id, code, name) values
  ('a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '01', 'RR Threads'),
  ('a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '02', 'RR Wanders'),
  ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '03', 'RR Marketing'),
  ('a0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '04', 'RR Connect'),
  ('a0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '05', 'RR Care'),
  ('a0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '06', 'RR Trading'),
  ('a0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '07', 'AI CRM / Boost')
on conflict (tenant_id, code) do nothing;

insert into public.brand_kits (
  tenant_id, company_id, business_unit_id,
  primary_color, accent_color,
  logo_horizontal_path, mark_square_path, legal_footer
)
values (
  'a0000000-0000-4000-8000-000000000001',
  null,
  null,
  '#C8321A',
  '#E8872A',
  'brand/redreach/redreach-middle-east-fze.png',
  'brand/redreach/mark/redreach-mark-square.jpg',
  'Red Reach Middle East FZE'
)
on conflict do nothing;

insert into public.brand_kits (
  tenant_id, company_id, business_unit_id,
  primary_color, accent_color, logo_horizontal_path, mark_square_path
)
select
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  bu.id,
  '#C8321A',
  '#E8872A',
  case bu.code
    when '01' then 'brand/redreach/divisions/redreach-threads.png'
    when '02' then 'brand/redreach/divisions/redreach-wanders.png'
    when '03' then 'brand/redreach/divisions/redreach-marketing.png'
    when '04' then 'brand/redreach/divisions/redreach-connect.png'
    else 'brand/redreach/redreach-middle-east-fze.png'
  end,
  'brand/redreach/mark/derived/redreach-mark-192.png'
from public.business_units bu
where bu.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  and bu.code in ('01', '02', '03', '04')
  and not exists (
    select 1 from public.brand_kits bk where bk.business_unit_id = bu.id
  );

------------------------------------------------------------
-- app_users.tenant_id
------------------------------------------------------------
alter table public.app_users
  add column if not exists tenant_id uuid references public.tenants (id);

update public.app_users
set tenant_id = 'a0000000-0000-4000-8000-000000000001'
where tenant_id is null;

------------------------------------------------------------
-- Stamp every other public table that holds business data
------------------------------------------------------------
do $$
declare
  t text;
  skip text[] := array[
    'tenants', 'companies', 'business_units', 'brand_kits', 'app_users'
  ];
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> all (skip)
    order by 1
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'tenant_id'
    ) then
      execute format(
        'alter table public.%I add column tenant_id uuid references public.tenants (id)',
        t
      );
    end if;
    execute format(
      'update public.%I set tenant_id = %L where tenant_id is null',
      t,
      'a0000000-0000-4000-8000-000000000001'
    );
    -- Default for new inserts during the single-tenant period
    execute format(
      'alter table public.%I alter column tenant_id set default %L::uuid',
      t,
      'a0000000-0000-4000-8000-000000000001'
    );
  end loop;
end $$;

alter table public.app_users
  alter column tenant_id set default 'a0000000-0000-4000-8000-000000000001'::uuid;

------------------------------------------------------------
-- Helpers
------------------------------------------------------------
create or replace function public.rr_my_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select au.tenant_id
  from public.app_users au
  where lower(au.email) = public.rr_current_email()
    and au.active
  limit 1
$$;

create or replace function public.rr_same_tenant(row_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select row_tenant is not null
    and row_tenant = public.rr_my_tenant_id()
$$;

revoke all on function public.rr_my_tenant_id() from public;
revoke all on function public.rr_same_tenant(uuid) from public;
grant execute on function public.rr_my_tenant_id() to authenticated;
grant execute on function public.rr_same_tenant(uuid) to authenticated;

------------------------------------------------------------
-- RLS on new tables + RESTRICTIVE tenant isolation everywhere
------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.companies enable row level security;
alter table public.business_units enable row level security;
alter table public.brand_kits enable row level security;

drop policy if exists "Members read own tenant" on public.tenants;
create policy "Members read own tenant" on public.tenants
  for select to authenticated
  using (id = public.rr_my_tenant_id());

drop policy if exists "Admins update own tenant" on public.tenants;
create policy "Admins update own tenant" on public.tenants
  for update to authenticated
  using (id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Members read companies" on public.companies;
create policy "Members read companies" on public.companies
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id());

drop policy if exists "Admins write companies" on public.companies;
create policy "Admins write companies" on public.companies
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Members read business units" on public.business_units;
create policy "Members read business units" on public.business_units
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id());

drop policy if exists "Admins write business units" on public.business_units;
create policy "Admins write business units" on public.business_units
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Members read brand kits" on public.brand_kits;
create policy "Members read brand kits" on public.brand_kits
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id());

drop policy if exists "Admins write brand kits" on public.brand_kits;
create policy "Admins write brand kits" on public.brand_kits
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

-- RESTRICTIVE policies AND with existing permissive staff policies.
-- Includes companies / business_units / brand_kits (have tenant_id).
-- tenants uses id = rr_my_tenant_id() (see below).
do $$
declare
  t text;
  skip text[] := array['tenants'];
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> all (skip)
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = c.relname and column_name = 'tenant_id'
      )
    order by 1
  loop
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation',
      t
    );
  end loop;
end $$;

drop policy if exists "Tenant isolation" on public.tenants;
create policy "Tenant isolation" on public.tenants
  as restrictive for all to authenticated
  using (id = public.rr_my_tenant_id())
  with check (id = public.rr_my_tenant_id());

-- Pass 2 of tests/run.sh re-runs older migrations that stamp every public
-- table with "Staff full access" / "Viewers read". Strip those from platform
-- tables so membership is tenant-scoped only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'companies', 'business_units', 'brand_kits'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
  end loop;
end $$;

------------------------------------------------------------
-- Domain event outbox (cross-module posts; workers later)
------------------------------------------------------------
create table if not exists public.event_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  event_type text not null,
  aggregate_type text not null default '',
  aggregate_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists event_outbox_pending_idx
  on public.event_outbox (tenant_id, available_at)
  where status = 'pending';

alter table public.event_outbox enable row level security;

drop policy if exists "Members read outbox" on public.event_outbox;
create policy "Members read outbox" on public.event_outbox
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff enqueue outbox" on public.event_outbox;
create policy "Staff enqueue outbox" on public.event_outbox
  for insert to authenticated
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins manage outbox" on public.event_outbox;
create policy "Admins manage outbox" on public.event_outbox
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Tenant isolation" on public.event_outbox;
create policy "Tenant isolation" on public.event_outbox
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.event_outbox;
drop policy if exists "Viewers read" on public.event_outbox;

comment on table public.tenants is 'RRCRM M1: customer account that subscribes (Red Reach = tenant one).';
comment on table public.companies is 'RRCRM M1: legal entities inside a tenant.';
comment on table public.business_units is 'RRCRM M1: divisions inside a company.';
comment on table public.brand_kits is 'RRCRM M1: brand kit per tenant / company / business unit.';
comment on table public.event_outbox is 'RRCRM M1: durable domain events for cross-module workers.';
