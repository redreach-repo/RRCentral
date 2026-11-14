-- RRCRM first slices for M6–M12 (HR, payroll, marketing, SaaS billing,
-- industry packs, maker-checker, public API). Demo isolation left alone.
-- These tables are foundations — not finished products.

------------------------------------------------------------
-- HR
------------------------------------------------------------
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  employee_code text not null default '',
  full_name text not null,
  email text not null default '',
  job_title text not null default '',
  department text not null default '',
  employment_status text not null default 'active'
    check (employment_status in ('active', 'onboarding', 'leave', 'exited')),
  start_date date,
  end_date date,
  basic_salary_aed numeric(14, 2),
  app_user_id uuid references public.app_users (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_code)
);

create index if not exists hr_employees_tenant_idx
  on public.hr_employees (tenant_id, employment_status);

------------------------------------------------------------
-- Payroll
------------------------------------------------------------
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  period_yyyy_mm text not null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'paid', 'void')),
  currency text not null default 'AED',
  notes text not null default '',
  created_by uuid references public.app_users (id) on delete set null,
  approved_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_yyyy_mm)
);

create table if not exists public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id uuid not null references public.hr_employees (id) on delete restrict,
  basic_aed numeric(14, 2) not null default 0,
  allowances_aed numeric(14, 2) not null default 0,
  deductions_aed numeric(14, 2) not null default 0,
  net_aed numeric(14, 2) not null default 0,
  gratuity_accrual_aed numeric(14, 2) not null default 0,
  wps_ready boolean not null default false,
  created_at timestamptz not null default now(),
  unique (run_id, employee_id)
);

create index if not exists payroll_runs_tenant_idx on public.payroll_runs (tenant_id, period_yyyy_mm);
create index if not exists payroll_lines_run_idx on public.payroll_lines (run_id);

------------------------------------------------------------
-- Marketing
------------------------------------------------------------
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  name text not null,
  channel text not null default 'email'
    check (channel in ('email', 'social', 'ads', 'event', 'other')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'active', 'paused', 'done')),
  starts_on date,
  ends_on date,
  budget_aed numeric(14, 2),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_campaigns_tenant_idx
  on public.marketing_campaigns (tenant_id, status);

------------------------------------------------------------
-- SaaS tenant billing (platform subscriptions — not customer invoices)
------------------------------------------------------------
create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  plan_key text not null,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  seats int not null default 5 check (seats > 0),
  stripe_customer_id text not null default '',
  stripe_subscription_id text not null default '',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

------------------------------------------------------------
-- Industry packs
------------------------------------------------------------
create table if not exists public.industry_packs (
  id uuid primary key default gen_random_uuid(),
  pack_key text not null unique,
  name text not null,
  description text not null default '',
  version text not null default '0.1.0',
  manifest jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_industry_packs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  pack_id uuid not null references public.industry_packs (id) on delete cascade,
  status text not null default 'available'
    check (status in ('available', 'active', 'retired')),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, pack_id)
);

insert into public.industry_packs (pack_key, name, description, manifest)
values
  (
    'uae_services',
    'UAE services',
    'Starter pack: VAT-aware quoting labels and follow-up views.',
    '{"modules":["sales","finance"],"locale":"en"}'::jsonb
  ),
  (
    'church_saas',
    'Church SaaS',
    'WorshipHub-oriented account fields and delivery checklists.',
    '{"modules":["clients","delivery"],"objects":["account"]}'::jsonb
  )
on conflict (pack_key) do nothing;

------------------------------------------------------------
-- Maker-checker
------------------------------------------------------------
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  object_type text not null,
  object_id text not null,
  action text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'canceled')),
  amount_aed numeric(14, 2),
  summary text not null default '',
  requested_by uuid references public.app_users (id) on delete set null,
  decided_by uuid references public.app_users (id) on delete set null,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists approval_requests_tenant_status_idx
  on public.approval_requests (tenant_id, status, created_at desc);

------------------------------------------------------------
-- Public API + outbound webhooks (partner facing)
------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes jsonb not null default '["read:accounts"]'::jsonb,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_prefix_idx on public.api_keys (key_prefix)
  where revoked_at is null;

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  url text not null,
  secret text not null default '',
  event_types jsonb not null default '["*"]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.hr_employees enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.industry_packs enable row level security;
alter table public.tenant_industry_packs enable row level security;
alter table public.approval_requests enable row level security;
alter table public.api_keys enable row level security;
alter table public.webhook_endpoints enable row level security;

-- Industry pack catalog is readable by any authenticated staff (global catalog).
drop policy if exists "Staff read industry packs" on public.industry_packs;
create policy "Staff read industry packs" on public.industry_packs
  for select to authenticated
  using (public.rr_is_staff());

drop policy if exists "Admins write industry packs" on public.industry_packs;
create policy "Admins write industry packs" on public.industry_packs
  for all to authenticated
  using (public.rr_is_admin())
  with check (public.rr_is_admin());

do $$
declare
  t text;
begin
  foreach t in array array[
    'hr_employees',
    'payroll_runs',
    'payroll_lines',
    'marketing_campaigns',
    'tenant_subscriptions',
    'tenant_industry_packs',
    'approval_requests',
    'api_keys',
    'webhook_endpoints'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Members read ' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Members read ' || t, t
    );
    execute format('drop policy if exists %I on public.%I', 'Staff write ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
         with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Staff write ' || t, t
    );
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t
    );
  end loop;
end $$;

-- Hide new modules by default when no moduleFlags row exists yet.
insert into public.app_settings (key, value)
select
  'moduleFlags',
  '{"hr":false,"payroll":false,"marketing":false,"saasBilling":false,"industryPacks":false}'
where not exists (select 1 from public.app_settings where key = 'moduleFlags');

comment on table public.hr_employees is 'M6 first slice: employee directory.';
comment on table public.payroll_runs is 'M8 first slice: payroll period runs.';
comment on table public.marketing_campaigns is 'M10 first slice: campaign list.';
comment on table public.tenant_subscriptions is 'M11 first slice: HighMast SaaS plan per tenant.';
comment on table public.industry_packs is 'M12 first slice: pack catalog.';
comment on table public.approval_requests is 'M7 first slice: maker-checker queue.';
comment on table public.api_keys is 'M11 first slice: public API keys (hashed).';
comment on table public.webhook_endpoints is 'M11 first slice: partner webhook URLs.';
