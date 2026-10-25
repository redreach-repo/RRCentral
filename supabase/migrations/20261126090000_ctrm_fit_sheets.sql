-- Wave 5, PR V: the prospect fit sheet. One sheet per CTRM Next account:
-- what they trade, trading or operations focus, how many users, the system
-- they use now, the decision maker, modules of interest (the list is kept in
-- Settings) and notes. Relationship facts only: never trades, positions or
-- prices, and no commission (that stays in ctrm_deal_commissions).
-- A deal cannot move to Demo done (or later) until the sheet has what they
-- trade, the focus, the number of users and the current system.
-- Safe to run more than once.

create table if not exists public.ctrm_fit_sheets (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  commodities text not null default '' check (char_length(commodities) <= 500),
  focus text not null default '' check (focus in ('', 'trading', 'operations', 'both')),
  user_count integer check (user_count between 0 and 100000),
  current_system text not null default '' check (char_length(current_system) <= 200),
  decision_maker_id uuid references public.account_contacts(id) on delete set null,
  modules text[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 4000),
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ctrm_fit_sheets enable row level security;
revoke all on public.ctrm_fit_sheets from anon;
grant select, insert, update, delete on public.ctrm_fit_sheets to authenticated;
drop policy if exists "Staff full access" on public.ctrm_fit_sheets;
drop policy if exists "Viewers read" on public.ctrm_fit_sheets;

drop policy if exists "Read fit sheets on visible accounts" on public.ctrm_fit_sheets;
create policy "Read fit sheets on visible accounts" on public.ctrm_fit_sheets
  for select to authenticated using (public.rr_can_read_account(account_id));
drop policy if exists "Add fit sheets on editable accounts" on public.ctrm_fit_sheets;
create policy "Add fit sheets on editable accounts" on public.ctrm_fit_sheets
  for insert to authenticated with check (public.rr_can_write_account(account_id));
drop policy if exists "Edit fit sheets on editable accounts" on public.ctrm_fit_sheets;
create policy "Edit fit sheets on editable accounts" on public.ctrm_fit_sheets
  for update to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));
drop policy if exists "Managers delete fit sheets" on public.ctrm_fit_sheets;
create policy "Managers delete fit sheets" on public.ctrm_fit_sheets
  for delete to authenticated using (public.rr_is_manager_or_admin());

-- The decision maker must be a contact on the same account; keep updated_at current.
create or replace function public.rr_fit_sheet_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.decision_maker_id is not null and not exists (
    select 1 from public.account_contacts where id = new.decision_maker_id and account_id = new.account_id
  ) then
    raise exception 'The decision maker must be a contact on this account';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rr_fit_sheet_guard on public.ctrm_fit_sheets;
create trigger rr_fit_sheet_guard before insert or update on public.ctrm_fit_sheets
  for each row execute function public.rr_fit_sheet_guard();

-- True when the account's fit sheet is filled in enough for a demo.
create or replace function public.rr_fit_sheet_ready(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ctrm_fit_sheets
    where account_id = acc
      and btrim(commodities) <> ''
      and focus <> ''
      and user_count is not null
      and btrim(current_system) <> ''
  )
$$;
grant execute on function public.rr_fit_sheet_ready(uuid) to authenticated;

-- Moving a deal from before Demo done to Demo done or later needs the fit sheet.
create or replace function public.rr_ctrm_demo_needs_fit_sheet()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  early constant text[] := array['identified', 'contacted', 'intro_call_booked'];
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.stage = any(early) or new.stage = 'lost' then return new; end if;
  if tg_op = 'UPDATE' and not (old.stage = any(early)) then return new; end if;
  if not public.rr_fit_sheet_ready(new.account_id) then
    raise exception 'Fill in the fit sheet before the demo: what they trade, the focus, the number of users and the current system'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists rr_ctrm_demo_needs_fit_sheet on public.ctrm_deals;
create trigger rr_ctrm_demo_needs_fit_sheet before insert or update of stage on public.ctrm_deals
  for each row execute function public.rr_ctrm_demo_needs_fit_sheet();

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.ctrm_fit_sheets;
    create trigger rr_audit after insert or update or delete on public.ctrm_fit_sheets
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
