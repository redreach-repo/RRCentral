-- RR Central modules, Phase 2: client delivery for AI CRM clients.
--
-- * `delivery_packages`: the package catalogue, editable (not hard coded).
-- * `contracts`, `build_stages`, `requirements`, `time_entries`,
--   `usage_records`: one set per account.
-- * Overage rates and the internal hourly rate live in app_settings under
--   the `delivery...` keys below, which only admins may change.
--
-- Access follows the account: whoever can read the account can read its
-- delivery records, whoever can edit the account can log hours, usage,
-- requirements and build progress. Contracts and the catalogue are written
-- by admin, manager and sales only.
--
-- Safe to re-run. Needs 20261023090000_accounts_foundation.sql first.

------------------------------------------------------------
-- 1. Package catalogue
------------------------------------------------------------
create table if not exists public.delivery_packages (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  monthly_fee_a numeric(12,2) not null default 0,
  setup_fee_b numeric(12,2) not null default 0,
  monthly_fee_b numeric(12,2) not null default 0,
  target_hours numeric(6,2) not null default 0,
  build_hours_target numeric(6,2) not null default 0,
  included_whatsapp integer not null default 0,
  support_response text not null default '',
  -- Working days to first response for the support desk (0 = same day).
  support_response_days numeric(4,1) not null default 2,
  -- Monthly AI spend included before overage. Null = not set yet (no AI overage billed).
  ai_cap_usd numeric(10,2),
  -- Lead data credits included per month. Null = not set yet (all credits are extra).
  included_lead_credits_usd numeric(10,2),
  -- Rough fixed monthly tool cost for the profitability view.
  tool_cost_aed numeric(10,2) not null default 0,
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.delivery_packages
  (code, name, monthly_fee_a, setup_fee_b, monthly_fee_b, target_hours, build_hours_target,
   included_whatsapp, support_response, support_response_days, sort)
values
  ('starter', 'Starter', 1900, 1800, 1700, 5, 12, 1000, '2 working days', 2, 1),
  ('growth', 'Growth', 4500, 3000, 4200, 14, 20, 4000, '1 working day', 1, 2),
  ('done_for_you', 'Done for you', 9000, 4500, 8400, 30, 30, 8000, 'Same day', 0, 3)
on conflict (code) do nothing;

------------------------------------------------------------
-- 2. Per account delivery tables
------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  package_id uuid references public.delivery_packages(id) on delete set null,
  option text not null default 'A' check (option in ('A', 'B')),
  monthly_fee numeric(12,2) not null default 0,
  setup_fee numeric(12,2) not null default 0,
  -- Amount of the setup fee paid so far (AED). Early exit = unpaid setup + 2 months.
  setup_fee_paid numeric(12,2) not null default 0,
  term_start date,
  term_end date,
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_months_left integer not null default 0 check (discount_months_left >= 0),
  annual_prepay boolean not null default false,
  status text not null default 'active' check (status in ('draft', 'active', 'ended', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_contracts_account on public.contracts (account_id);
create index if not exists idx_contracts_term_end on public.contracts (term_end);

create table if not exists public.build_stages (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  stage text not null check (stage in (
    'discovery', 'requirements_signed_off', 'build', 'whatsapp_setup', 'testing', 'live'
  )),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'blocked', 'done')),
  owner_user_id uuid references public.app_users(id) on delete set null,
  due_date date,
  blocker_note text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, stage)
);

create table if not exists public.requirements (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  detail text not null default '',
  status text not null default 'open' check (status in ('open', 'agreed', 'built', 'changed')),
  source text not null default '',
  -- Raised or changed after requirements were signed off.
  is_change_request boolean not null default false,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_requirements_account on public.requirements (account_id);

create table if not exists public.time_entries (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  user_email text not null default '',
  date date not null default current_date,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  category text not null default 'build'
    check (category in ('build', 'support', 'reporting', 'leads', 'content', 'admin')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_time_entries_account_date on public.time_entries (account_id, date);

create table if not exists public.usage_records (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- First day of the month.
  month date not null check (extract(day from month) = 1),
  whatsapp_marketing_count integer not null default 0 check (whatsapp_marketing_count >= 0),
  whatsapp_service_count integer not null default 0 check (whatsapp_service_count >= 0),
  ai_cost_usd numeric(10,2) not null default 0 check (ai_cost_usd >= 0),
  lead_credits_cost_usd numeric(10,2) not null default 0 check (lead_credits_cost_usd >= 0),
  updated_at timestamptz not null default now(),
  unique (account_id, month)
);

------------------------------------------------------------
-- 3. Config: overage rates and internal hourly rate (admin only to change)
------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('deliveryMarketingRateAed', '0.30'),
  ('deliveryServiceRateAed', '0.07'),
  ('deliveryAiMarkupPercent', '25'),
  ('deliveryLeadMarkupPercent', '30'),
  ('deliveryInternalHourlyRateAed', '150'),
  ('deliveryUsdToAed', '3.6725')
on conflict (key) do nothing;

create or replace function public.rr_is_protected_setting(setting_key text)
returns boolean
language sql
immutable
as $$
  select setting_key in (
      'companyName', 'accountName', 'bankName', 'bankAccount', 'iban', 'swift',
      'trn', 'vatRate', 'currency', 'email', 'address', 'apiToken'
    )
    or public.rr_is_secret_setting(setting_key)
    or setting_key ilike 'zoho%'
    or setting_key in (
      'deliveryMarketingRateAed', 'deliveryServiceRateAed', 'deliveryAiMarkupPercent',
      'deliveryLeadMarkupPercent', 'deliveryInternalHourlyRateAed', 'deliveryUsdToAed'
    )
$$;

------------------------------------------------------------
-- 4. Row Level Security
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'delivery_packages', 'contracts', 'build_stages', 'requirements', 'time_entries', 'usage_records'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    -- Never the blanket policy 20260926090000_security_rls.sql adds on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
    execute format('drop policy if exists "Read on visible accounts" on public.%I', t);
    execute format('drop policy if exists "Write on editable accounts" on public.%I', t);
  end loop;
end $$;

drop policy if exists "Members read packages" on public.delivery_packages;
drop policy if exists "Managers edit packages" on public.delivery_packages;
create policy "Members read packages" on public.delivery_packages
  for select to authenticated using (public.rr_is_member());
create policy "Managers edit packages" on public.delivery_packages
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Contracts: visible with the account, written by the core team.
drop policy if exists "Team writes contracts" on public.contracts;
create policy "Read on visible accounts" on public.contracts
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Team writes contracts" on public.contracts
  for all to authenticated
  using (public.rr_is_staff() and public.rr_can_write_account(account_id))
  with check (public.rr_is_staff() and public.rr_can_write_account(account_id));

-- Build stages, requirements, usage: anyone who can edit the account.
do $$
declare
  t text;
begin
  foreach t in array array['build_stages', 'requirements', 'usage_records'] loop
    execute format(
      'create policy "Read on visible accounts" on public.%I for select to authenticated
         using (public.rr_can_read_account(account_id))', t);
    execute format(
      'create policy "Write on editable accounts" on public.%I for all to authenticated
         using (public.rr_can_write_account(account_id))
         with check (public.rr_can_write_account(account_id))', t);
  end loop;
end $$;

-- Hours: log your own on accounts you can edit; managers can fix anyone's.
drop policy if exists "Log own hours" on public.time_entries;
drop policy if exists "Edit own hours" on public.time_entries;
drop policy if exists "Delete own hours" on public.time_entries;
create policy "Read on visible accounts" on public.time_entries
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Log own hours" on public.time_entries
  for insert to authenticated
  with check (
    public.rr_can_write_account(account_id)
    and (user_id = public.rr_current_user_id() or public.rr_is_manager_or_admin())
  );
create policy "Edit own hours" on public.time_entries
  for update to authenticated
  using (
    public.rr_can_write_account(account_id)
    and (user_id = public.rr_current_user_id() or public.rr_is_manager_or_admin())
  )
  with check (
    public.rr_can_write_account(account_id)
    and (user_id = public.rr_current_user_id() or public.rr_is_manager_or_admin())
  );
create policy "Delete own hours" on public.time_entries
  for delete to authenticated
  using (
    public.rr_can_write_account(account_id)
    and (user_id = public.rr_current_user_id() or public.rr_is_manager_or_admin())
  );

-- Audit trail.
do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    return;
  end if;
  foreach t in array array[
    'delivery_packages', 'contracts', 'build_stages', 'requirements', 'time_entries', 'usage_records'
  ] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
