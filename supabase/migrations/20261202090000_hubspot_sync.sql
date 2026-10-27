begin;

-- HubSpot: RR Central pushes accounts, contacts and AI CRM deals to HubSpot
-- (one way; nothing in HubSpot changes RR Central).
--
-- hubspot_links: which HubSpot record each RR Central row became, and a
-- fingerprint of what was last sent so unchanged rows are skipped.
-- hubspot_sync_runs: a short log of each sync.
--
-- Both are written only by the hubspot-sync Edge Function (service role).
-- Managers and admins can read them. Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.hubspot_sync_runs;
--   drop table if exists public.hubspot_links;

create table if not exists public.hubspot_links (
  id uuid primary key default uuid_generate_v4(),
  rr_table text not null check (rr_table in ('accounts', 'account_contacts', 'sales_deals')),
  rr_id uuid not null,
  hubspot_type text not null check (hubspot_type in ('companies', 'contacts', 'deals')),
  hubspot_id text not null,
  synced_hash text not null default '',
  synced_at timestamptz not null default now(),
  unique (rr_table, rr_id)
);
create index if not exists idx_hubspot_links_hubspot on public.hubspot_links (hubspot_type, hubspot_id);

create table if not exists public.hubspot_sync_runs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  requested_by text not null default '',
  companies_created integer not null default 0,
  companies_updated integer not null default 0,
  contacts_created integer not null default 0,
  contacts_updated integer not null default 0,
  deals_created integer not null default 0,
  deals_updated integer not null default 0,
  failed integer not null default 0,
  more_to_do boolean not null default false,
  message text not null default ''
);
create index if not exists idx_hubspot_sync_runs_started on public.hubspot_sync_runs (started_at desc);

alter table public.hubspot_links enable row level security;
alter table public.hubspot_sync_runs enable row level security;
revoke all on public.hubspot_links from anon;
revoke all on public.hubspot_sync_runs from anon;
revoke insert, update, delete on public.hubspot_links from authenticated;
revoke insert, update, delete on public.hubspot_sync_runs from authenticated;
grant select on public.hubspot_links to authenticated;
grant select on public.hubspot_sync_runs to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['hubspot_links', 'hubspot_sync_runs'] loop
    -- Never the blanket policies earlier migrations add on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
    execute format('drop policy if exists "Managers read" on public.%I', t);
    execute format(
      'create policy "Managers read" on public.%I for select to authenticated using (public.rr_is_manager_or_admin())',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
