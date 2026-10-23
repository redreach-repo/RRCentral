-- RR Central roadmap item 3: automatic usage import.
--
-- 1. usage_sources: per client, the WhatsApp phone numbers and the Anthropic
--    workspace that belong to it. Managers and admins set them.
-- 2. usage_records.imported_at: when the import last wrote the row. A row
--    edited by hand after that is left alone by later imports.
-- 3. usage_import_runs: a short log of each import, written only by the
--    usage-import Edge Function (service role).
--
-- The daily schedule is set up separately once the secrets are in place
-- (see docs/usage-import.md). Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.usage_import_runs;
--   drop table if exists public.usage_sources;
--   alter table public.usage_records drop column if exists imported_at;

alter table public.usage_records add column if not exists imported_at timestamptz;

create table if not exists public.usage_sources (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  -- Digits only, e.g. 971501234567.
  whatsapp_phones text[] not null default '{}',
  ai_workspace_id text not null default '',
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_import_runs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  requested_by text not null default '',
  whatsapp_status text not null default '',
  ai_status text not null default '',
  rows_written integer not null default 0,
  message text not null default ''
);
create index if not exists idx_usage_import_runs_started on public.usage_import_runs (started_at desc);

alter table public.usage_sources enable row level security;
alter table public.usage_import_runs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['usage_sources', 'usage_import_runs'] loop
    -- Never the blanket policies earlier migrations add on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
  end loop;
end $$;

drop policy if exists "Read on visible accounts" on public.usage_sources;
drop policy if exists "Managers set sources" on public.usage_sources;
create policy "Read on visible accounts" on public.usage_sources
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Managers set sources" on public.usage_sources
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Runs: managers and admins read; only the function (service role) writes.
drop policy if exists "Managers read runs" on public.usage_import_runs;
create policy "Managers read runs" on public.usage_import_runs
  for select to authenticated using (public.rr_is_manager_or_admin());

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.usage_sources;
    create trigger rr_audit after insert or update or delete on public.usage_sources
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
