-- RR Central Wave 2, PR F: the daily watchdog's list.
--
-- watch_items holds what the watchdog found each morning (stale deals,
-- overdue invoices, tickets near or past their reply time, clients over
-- hours, renewals within 30 days, contracts past their end date). Each row
-- has an owner, a reason and a link. The watchdog Edge Function writes it with
-- the service key; nobody writes it from the app. A row the watchdog no
-- longer finds gets cleared_at set, so fixing the cause clears it.
--
-- Who reads it: admin, manager and sales see every item, viewers read them
-- too (as they read invoices), and staff only see items they own.
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.watch_items;

create table if not exists public.watch_items (
  id uuid primary key default uuid_generate_v4(),
  -- Stable while the cause lasts, e.g. invoice_overdue:<invoice id>.
  key text not null unique,
  kind text not null check (kind in ('stale_deal', 'invoice_overdue', 'ticket_sla', 'over_hours', 'renewal', 'contract_expired')),
  severity text not null default 'warning' check (severity in ('warning', 'urgent')),
  title text not null default '',
  reason text not null default '',
  link text not null default '',
  owner_user_id uuid references public.app_users(id) on delete set null,
  owner_label text not null default '',
  account_id uuid references public.accounts(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when the watchdog no longer finds it; cleared again if it comes back.
  cleared_at timestamptz
);
create index if not exists idx_watch_items_open on public.watch_items (cleared_at, severity);
create index if not exists idx_watch_items_owner on public.watch_items (owner_user_id);

alter table public.watch_items enable row level security;

-- Never the blanket policy 20260926090000_security_rls.sql adds on re-run.
drop policy if exists "Staff full access" on public.watch_items;
drop policy if exists "Viewers read" on public.watch_items;
drop policy if exists "Team reads watch items" on public.watch_items;
create policy "Team reads watch items" on public.watch_items for select to authenticated
  using (
    public.rr_is_staff()
    or public.rr_current_role() = 'viewer'
    or (public.rr_current_role() = 'staff' and owner_user_id = public.rr_current_user_id())
  );
-- No insert, update or delete policies: only the watchdog (service key) writes.

notify pgrst, 'reload schema';
