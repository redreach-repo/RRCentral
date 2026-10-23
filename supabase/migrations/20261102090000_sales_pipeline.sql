begin;

-- RR Central roadmap item 5: pre-sale pipeline for AI CRM prospects.
--
-- sales_deals: one row per prospect, moving lead > discovery call > quote
-- sent > signed (or lost). The quote (package, option, fees, discount, start)
-- lives on the deal, and "Make contract" in the app turns it into the
-- client's contract and links it here.
--
-- Access follows the account, like CTRM Next deals. Prospects are AI CRM
-- accounts with the status 'prospect'. Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.sales_deals;

create table if not exists public.sales_deals (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  stage text not null default 'lead' check (stage in ('lead', 'discovery_call', 'quote_sent', 'signed', 'lost')),
  source text not null default '',
  owner_user_id uuid references public.app_users(id) on delete set null,
  next_action text not null default '',
  next_action_date date,
  lost_reason text not null default '',
  notes text not null default '',
  discovery_call_date date,
  -- The quote, in AED excluding VAT.
  package_id uuid references public.delivery_packages(id) on delete set null,
  option text not null default 'A' check (option in ('A', 'B')),
  monthly_fee numeric(12,2) not null default 0 check (monthly_fee >= 0),
  setup_fee numeric(12,2) not null default 0 check (setup_fee >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_months integer not null default 0 check (discount_months between 0 and 12),
  start_date date,
  quote_reference text not null default '',
  quote_sent_at timestamptz,
  -- Set by Make contract. One deal per contract.
  contract_id uuid unique references public.contracts(id) on delete set null,
  signed_at timestamptz,
  last_touch_at timestamptz not null default now(),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Moving a deal to lost needs a reason.
  constraint sales_deals_lost_reason check (stage <> 'lost' or btrim(lost_reason) <> ''),
  -- Every open deal needs a next action and a date.
  constraint sales_deals_next_action check (
    stage in ('signed', 'lost') or (btrim(next_action) <> '' and next_action_date is not null)
  )
);
create index if not exists sales_deals_account_idx on public.sales_deals (account_id);
create index if not exists sales_deals_stage_idx on public.sales_deals (stage);

alter table public.sales_deals enable row level security;
revoke all on public.sales_deals from anon;
grant select, insert, update, delete on public.sales_deals to authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.sales_deals;
drop policy if exists "Viewers read" on public.sales_deals;

drop policy if exists "Read sales deals on visible accounts" on public.sales_deals;
drop policy if exists "Write sales deals on editable accounts" on public.sales_deals;
create policy "Read sales deals on visible accounts" on public.sales_deals
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Write sales deals on editable accounts" on public.sales_deals
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
    drop trigger if exists rr_audit on public.sales_deals;
    create trigger rr_audit after insert or update or delete on public.sales_deals
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
