begin;

-- RR Central roadmap item 4: daily digest.
--
-- 1. digest_recipients: who gets the morning digest, by email and/or
--    WhatsApp. Managers and admins keep the list.
-- 2. digest_runs: a short log of each digest, written only by the
--    daily-digest Edge Function (service role). The schedule can send at
--    most one digest a day.
--
-- The daily schedule is set up separately once the function is deployed
-- (see docs/daily-digest.md). Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.digest_runs;
--   drop table if exists public.digest_recipients;

create table if not exists public.digest_recipients (
  id uuid primary key default uuid_generate_v4(),
  name text not null default '',
  email text not null default '',
  -- Digits only, e.g. 971501234567.
  whatsapp_phone text not null default '',
  by_email boolean not null default true,
  by_whatsapp boolean not null default false,
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digest_runs (
  id uuid primary key default uuid_generate_v4(),
  run_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  requested_by text not null default '',
  item_count integer not null default 0,
  emails_sent integer not null default 0,
  whatsapp_sent integer not null default 0,
  email_status text not null default '',
  whatsapp_status text not null default '',
  message text not null default ''
);
create index if not exists idx_digest_runs_started on public.digest_runs (started_at desc);
-- The schedule sends at most once a day, even if it fires twice.
create unique index if not exists idx_digest_runs_one_scheduled_per_day
  on public.digest_runs (run_date) where trigger = 'schedule';

alter table public.digest_recipients enable row level security;
alter table public.digest_runs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['digest_recipients', 'digest_runs'] loop
    -- Never the blanket policies earlier migrations add on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
  end loop;
end $$;

drop policy if exists "Managers keep recipients" on public.digest_recipients;
create policy "Managers keep recipients" on public.digest_recipients
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Runs: managers and admins read; only the function (service role) writes.
drop policy if exists "Managers read digest runs" on public.digest_runs;
create policy "Managers read digest runs" on public.digest_runs
  for select to authenticated using (public.rr_is_manager_or_admin());

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.digest_recipients;
    create trigger rr_audit after insert or update or delete on public.digest_recipients
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
