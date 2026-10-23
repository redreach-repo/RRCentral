-- RR Central roadmap item 2: invoices raised from contracts, and payment reminders.
--
-- 1. contracts.auto_invoice and contracts.billing_from. Existing contracts
--    start with auto_invoice off, so nothing is invoiced twice; turn it on
--    per contract from the client page.
-- 2. contract_invoices: one row per contract, kind and month, so a setup or
--    monthly invoice is only ever raised once, even if two people have the
--    app open. The invoices themselves are ordinary drafts in invoices.
-- 3. invoice_reminders: which late payment reminders (3, 7, 14 days) went out.
--
-- Only the core team (admin, manager, sales), who already create invoices,
-- can write the new tables; viewers can read them, as they read invoices. Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.invoice_reminders;
--   drop table if exists public.contract_invoices;
--   alter table public.contracts drop column if exists auto_invoice;
--   alter table public.contracts drop column if exists billing_from;

alter table public.contracts add column if not exists auto_invoice boolean not null default false;
alter table public.contracts add column if not exists billing_from date
  check (billing_from is null or extract(day from billing_from) = 1);

create table if not exists public.contract_invoices (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('setup', 'monthly')),
  period date not null check (extract(day from period) = 1),
  -- Null once the draft is deleted: that month is then skipped, not raised again.
  invoice_id uuid references public.invoices(id) on delete set null,
  -- Total incl. VAT when raised; a draft is only refreshed while it still matches.
  generated_amount numeric(12,2) not null default 0,
  -- True when this invoice used one of the contract's discounted months.
  discount_applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contract_id, kind, period)
);
create index if not exists idx_contract_invoices_invoice on public.contract_invoices (invoice_id);

create table if not exists public.invoice_reminders (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  stage integer not null check (stage in (3, 7, 14)),
  channel text not null default 'email' check (channel in ('email', 'whatsapp', 'other')),
  sent_by text not null default '',
  sent_at timestamptz not null default now(),
  unique (invoice_id, stage)
);

alter table public.contract_invoices enable row level security;
alter table public.invoice_reminders enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['contract_invoices', 'invoice_reminders'] loop
    -- Never the blanket policy 20260926090000_security_rls.sql adds on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
    execute format('drop policy if exists "Core team reads" on public.%I', t);
    execute format('drop policy if exists "Core team writes" on public.%I', t);
    execute format('drop policy if exists "Core team updates" on public.%I', t);
    execute format('drop policy if exists "Admins delete" on public.%I', t);
    execute format(
      'create policy "Core team reads" on public.%I for select to authenticated
         using (public.rr_is_staff() or public.rr_current_role() = ''viewer'')', t);
    execute format(
      'create policy "Core team writes" on public.%I for insert to authenticated with check (public.rr_is_staff())', t);
    execute format(
      'create policy "Core team updates" on public.%I for update to authenticated
         using (public.rr_is_staff()) with check (public.rr_is_staff())', t);
    execute format(
      'create policy "Admins delete" on public.%I for delete to authenticated using (public.rr_is_admin())', t);
  end loop;
end $$;

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
  foreach t in array array['contract_invoices', 'invoice_reminders'] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
