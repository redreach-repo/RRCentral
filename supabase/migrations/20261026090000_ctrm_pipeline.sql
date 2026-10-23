-- RR Central modules, Phase 4: CTRM Next partner pipeline.
--
-- A lead pipeline, kept apart from client delivery and finance:
-- * `ctrm_deals`: one row per prospect being introduced to CTRM Next.
-- * `ctrm_deal_stage_changes`: every stage move, for the weekly summary.
-- * `ctrm_deal_commissions`: commission owed to Red Reach (the company, never
--   a person). A separate table so only admin, manager and sales can read it;
--   staff and viewers never receive the figures.
--
-- Access follows the account, like the other modules.
-- Safe to re-run. Needs 20261025090000_support_desk.sql first.

create table if not exists public.ctrm_deals (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  stage text not null default 'identified' check (stage in (
    'identified', 'contacted', 'intro_call_booked', 'demo_done',
    'evaluating', 'decision_pending', 'signed', 'lost'
  )),
  region text not null default 'middle_east' check (region in ('middle_east', 'india')),
  company_type text not null default 'other' check (company_type in ('trading_house', 'energy', 'other')),
  primary_contact_id uuid references public.account_contacts(id) on delete set null,
  source text not null default '',
  owner_user_id uuid references public.app_users(id) on delete set null,
  last_touch_at timestamptz not null default now(),
  next_action text not null default '',
  next_action_date date,
  lost_reason text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Moving a deal to lost needs a reason.
  constraint ctrm_deals_lost_reason check (stage <> 'lost' or btrim(lost_reason) <> ''),
  -- Every open deal needs a next action and a date.
  constraint ctrm_deals_next_action check (
    stage in ('signed', 'lost') or (btrim(next_action) <> '' and next_action_date is not null)
  )
);
create index if not exists ctrm_deals_account_idx on public.ctrm_deals (account_id);
create index if not exists ctrm_deals_stage_idx on public.ctrm_deals (stage);

create table if not exists public.ctrm_deal_stage_changes (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references public.ctrm_deals(id) on delete cascade,
  from_stage text not null default '',
  to_stage text not null,
  changed_by text not null default '',
  changed_at timestamptz not null default now()
);
create index if not exists ctrm_stage_changes_deal_idx on public.ctrm_deal_stage_changes (deal_id, changed_at);

create table if not exists public.ctrm_deal_commissions (
  id uuid not null unique default uuid_generate_v4(),
  deal_id uuid primary key references public.ctrm_deals(id) on delete cascade,
  expected_commission numeric(12,2) not null default 0 check (expected_commission >= 0),
  commission_received numeric(12,2) not null default 0 check (commission_received >= 0),
  currency text not null default 'AED',
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------
create or replace function public.rr_can_read_deal(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.ctrm_deals d
    where d.id = target and public.rr_can_read_account(d.account_id)
  )
$$;
create or replace function public.rr_can_write_deal(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.ctrm_deals d
    where d.id = target and public.rr_can_write_account(d.account_id)
  )
$$;
revoke all on function public.rr_can_read_deal(uuid) from public;
revoke all on function public.rr_can_write_deal(uuid) from public;
grant execute on function public.rr_can_read_deal(uuid) to authenticated;
grant execute on function public.rr_can_write_deal(uuid) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['ctrm_deals', 'ctrm_deal_stage_changes', 'ctrm_deal_commissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    -- Never the blanket policy 20260926090000_security_rls.sql adds on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
  end loop;
end $$;

drop policy if exists "Read deals on visible accounts" on public.ctrm_deals;
drop policy if exists "Write deals on editable accounts" on public.ctrm_deals;
create policy "Read deals on visible accounts" on public.ctrm_deals
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Write deals on editable accounts" on public.ctrm_deals
  for all to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));

drop policy if exists "Read stage history on visible deals" on public.ctrm_deal_stage_changes;
drop policy if exists "Record stage moves on editable deals" on public.ctrm_deal_stage_changes;
create policy "Read stage history on visible deals" on public.ctrm_deal_stage_changes
  for select to authenticated using (public.rr_can_read_deal(deal_id));
-- History is append only for the team.
create policy "Record stage moves on editable deals" on public.ctrm_deal_stage_changes
  for insert to authenticated with check (public.rr_can_write_deal(deal_id));

drop policy if exists "Core team reads commission" on public.ctrm_deal_commissions;
drop policy if exists "Core team writes commission" on public.ctrm_deal_commissions;
create policy "Core team reads commission" on public.ctrm_deal_commissions
  for select to authenticated using (public.rr_is_staff() and public.rr_can_read_deal(deal_id));
create policy "Core team writes commission" on public.ctrm_deal_commissions
  for all to authenticated
  using (public.rr_is_staff() and public.rr_can_write_deal(deal_id))
  with check (public.rr_is_staff() and public.rr_can_write_deal(deal_id));

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
  foreach t in array array['ctrm_deals', 'ctrm_deal_stage_changes', 'ctrm_deal_commissions'] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
