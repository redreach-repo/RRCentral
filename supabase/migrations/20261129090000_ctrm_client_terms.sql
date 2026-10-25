-- Wave 5, PR Y: contract and renewal dates for CTRM Next clients, like the
-- WorshipHub renewal date. One row per account: contract start, renewal
-- date and notice period in days. The dashboard and the daily digest remind
-- at 90, 60 and 30 days before renewal, and show the last day to give
-- notice. Dates only: no prices, fees or commission (commission stays in
-- ctrm_deal_commissions). Safe to run more than once.

create table if not exists public.ctrm_client_terms (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  contract_start date,
  renewal_date date,
  notice_days integer not null default 0 check (notice_days between 0 and 365),
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (renewal_date is null or contract_start is null or renewal_date > contract_start)
);
create index if not exists ctrm_client_terms_renewal_idx on public.ctrm_client_terms (renewal_date);

alter table public.ctrm_client_terms enable row level security;
revoke all on public.ctrm_client_terms from anon;
grant select, insert, update, delete on public.ctrm_client_terms to authenticated;
drop policy if exists "Staff full access" on public.ctrm_client_terms;
drop policy if exists "Viewers read" on public.ctrm_client_terms;

drop policy if exists "Read terms on visible accounts" on public.ctrm_client_terms;
create policy "Read terms on visible accounts" on public.ctrm_client_terms
  for select to authenticated using (public.rr_can_read_account(account_id));
-- Contract dates are set by sales, managers and admins, not the VA.
drop policy if exists "Sales add terms" on public.ctrm_client_terms;
create policy "Sales add terms" on public.ctrm_client_terms
  for insert to authenticated with check (public.rr_is_staff() and public.rr_can_write_account(account_id));
drop policy if exists "Sales edit terms" on public.ctrm_client_terms;
create policy "Sales edit terms" on public.ctrm_client_terms
  for update to authenticated
  using (public.rr_is_staff() and public.rr_can_write_account(account_id))
  with check (public.rr_is_staff() and public.rr_can_write_account(account_id));
drop policy if exists "Managers delete terms" on public.ctrm_client_terms;
create policy "Managers delete terms" on public.ctrm_client_terms
  for delete to authenticated using (public.rr_is_manager_or_admin());

create or replace function public.rr_ctrm_terms_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rr_ctrm_terms_touch on public.ctrm_client_terms;
create trigger rr_ctrm_terms_touch before insert or update on public.ctrm_client_terms
  for each row execute function public.rr_ctrm_terms_touch();

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.ctrm_client_terms;
    create trigger rr_audit after insert or update or delete on public.ctrm_client_terms
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
