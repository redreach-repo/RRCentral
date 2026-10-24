begin;

-- RR Central Tier 4: client health score.
--
-- report_calls: whether each client joined their monthly report call
-- (attended, missed or moved), one row per client per month. It is one of
-- the four parts of the client health score, with usage, support tickets
-- and payment lateness, which RR Central works out from data it already has.
--
-- Follows the account, like the rest of delivery: the team reads it on
-- accounts it can see and records it on accounts it can edit.
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.report_calls;

create table if not exists public.report_calls (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  status text not null check (status in ('attended', 'missed', 'rescheduled')),
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, month)
);

alter table public.report_calls enable row level security;
revoke all on public.report_calls from anon;
grant select, insert, update, delete on public.report_calls to authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.report_calls;
drop policy if exists "Viewers read" on public.report_calls;

drop policy if exists "Read report calls on visible accounts" on public.report_calls;
drop policy if exists "Write report calls on editable accounts" on public.report_calls;
create policy "Read report calls on visible accounts" on public.report_calls
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Write report calls on editable accounts" on public.report_calls
  for all to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    execute 'drop trigger if exists rr_audit on public.report_calls';
    execute 'create trigger rr_audit after insert or update or delete on public.report_calls
               for each row execute function public.rr_audit_trigger()';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
