-- Quote follow-up chasing (Alfred 2026-11-28, "Quote and invoice chasing").
--
-- The invoice side (20261328090000_ar_chase.sql) chases money that is owed.
-- This does the same for quotes that went out and have no answer yet, so a
-- Sent quote is followed up on a schedule instead of being forgotten until it
-- quietly expires. Three new tables, nothing else changes. Quote numbers,
-- lines, totals and status are never touched here.
--
-- * quote_chase_settings  one row per tenant: the follow-up schedule.
--                         Default (no row): follow up 3, 7 and 14 days after
--                         the quote was sent, a reminder 3 days before it
--                         expires, and escalate to the owner at 21 days.
-- * quote_chase_log       every follow-up of a quote: date, channel (email,
--                         call, WhatsApp, visit), contact, note, the client's
--                         answer and an agreed call-back date. Added from the
--                         Quote follow-up page, the quote list or the AI
--                         connector (add_quote_chase_note).
-- * quote_chase_tasks     the follow-up task for each schedule step a quote
--                         reaches (one per quote, kind and step). Tasks carry
--                         no message: the app shows a draft and a person
--                         presses send. Nothing here ever emails or WhatsApps
--                         a client.
--
-- Access (same as quotes):
--   admin / manager / sales  read; add follow-ups; work tasks
--   viewer                   read only
--   staff                    no access
--   schedule                 admin / manager change it
--   change or remove a follow-up, remove a task: admin / manager only
--   Sales without "see company money": only follow-ups and tasks of their
--   own quotes (the Sales lock of 20261332090000_sales_own_clients.sql).
-- Plus tenant isolation. The tenant always comes from the quote.
--
-- AI connector keys: may read all three, add follow-ups and complete tasks.
-- They never change the schedule, never edit or remove a follow-up and never
-- add tasks. Keys with departments reach them like quotes (sales, finance).
--
-- Safe to re-run.
--
-- To reverse:
--   drop table if exists public.quote_chase_tasks;
--   drop table if exists public.quote_chase_log;
--   drop table if exists public.quote_chase_settings;
--   drop function if exists public.rr_quote_chase_stamp();
--   drop function if exists public.rr_quote_chase_task_stamp();
--   drop function if exists public.rr_quote_chase_valid_days(integer[]);

do $$
begin
  if to_regclass('public.quotations') is null or to_regclass('public.tenants') is null then
    raise exception 'Run the platform tenancy migration first (quotations or tenants is missing).';
  end if;
end $$;

------------------------------------------------------------
-- 1. Follow-up schedule per tenant
------------------------------------------------------------
create or replace function public.rr_quote_chase_valid_days(p_days integer[])
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(p_days) between 1 and 12, false)
     and coalesce((select bool_and(d between 1 and 180) from unnest(p_days) d), false)
$$;

create table if not exists public.quote_chase_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  followup_days integer[] not null default '{3,7,14}'
    check (public.rr_quote_chase_valid_days(followup_days)),
  -- A reminder this many days before the quote's valid_until. 0 = none.
  expiry_warn_days integer not null default 3 check (expiry_warn_days between 0 and 60),
  escalate_days integer not null default 21 check (escalate_days between 1 and 180),
  -- Who gets the escalation task. Null: the owners (admins) pick it up.
  escalate_to_user_id uuid references public.app_users (id) on delete set null,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.quote_chase_settings is
  'Quote follow-up: days after sending to follow up, reminder before expiry, escalate day, per tenant. No row = 3, 7, 14, 3 before expiry, escalate at 21.';

------------------------------------------------------------
-- 2. Follow-up log
------------------------------------------------------------
create table if not exists public.quote_chase_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  chased_on date not null default current_date,
  channel text not null check (channel in ('email', 'call', 'whatsapp', 'visit')),
  contact text not null default '' check (length(contact) <= 200),
  note text not null default '' check (length(note) <= 4000),
  -- What the client said. '' = not recorded.
  response text not null default ''
    check (response in ('', 'no_reply', 'interested', 'needs_changes', 'on_hold', 'declined')),
  -- Agreed date to follow up again (the client asked to be called back).
  next_follow_up date,
  created_by uuid references public.app_users (id) on delete set null,
  created_by_email text not null default '',
  source text not null default 'app' check (source in ('app', 'ai')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (next_follow_up is null or next_follow_up >= chased_on),
  check (length(trim(note)) > 0 or next_follow_up is not null or response <> '')
);

create index if not exists quote_chase_log_quote_idx
  on public.quote_chase_log (quotation_id, chased_on desc, created_at desc);
create index if not exists quote_chase_log_tenant_idx
  on public.quote_chase_log (tenant_id, chased_on desc);

comment on table public.quote_chase_log is
  'Every follow-up of a sent quote: date, channel, contact, note, client answer, agreed call-back date, who. A passed call-back date with the quote still open is a missed call-back.';

------------------------------------------------------------
-- 3. Follow-up tasks (one per quote, kind and step)
------------------------------------------------------------
create table if not exists public.quote_chase_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  -- followup / escalate: days after sending. expiry: days before valid_until.
  step_day integer not null check (step_day between 0 and 180),
  kind text not null default 'followup' check (kind in ('followup', 'expiry', 'escalate')),
  due_on date not null,
  assigned_to uuid references public.app_users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'skipped', 'closed')),
  outcome text not null default '' check (length(outcome) <= 2000),
  done_at timestamptz,
  done_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_chase_tasks_step_key unique (quotation_id, kind, step_day)
);

create index if not exists quote_chase_tasks_open_idx
  on public.quote_chase_tasks (tenant_id, status, due_on);

comment on table public.quote_chase_tasks is
  'Follow-up task for each step a sent quote reaches (follow up, before expiry, escalate to owner). Drafts only: a person sends anything.';

------------------------------------------------------------
-- 4. Stamps: tenant from the quote, who from the session
------------------------------------------------------------
create or replace function public.rr_quote_chase_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  t uuid;
begin
  select q.tenant_id into t from public.quotations q where q.id = new.quotation_id;
  if t is null then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  new.tenant_id := t;
  if tg_table_name = 'quote_chase_log' then
    if tg_op = 'INSERT' then
      if auth.uid() is not null then
        new.created_by := public.rr_current_user_id();
        new.created_by_email := coalesce(public.rr_current_email(), '');
      end if;
      new.source := case when public.rr_mcp_key_id() is null then 'app' else 'ai' end;
      new.created_at := now();
    else
      -- Corrections keep who logged it and when.
      new.created_by := old.created_by;
      new.created_by_email := old.created_by_email;
      new.source := old.source;
      new.created_at := old.created_at;
    end if;
    if new.chased_on > current_date + 1 then
      raise exception 'The follow-up date cannot be in the future.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.rr_quote_chase_stamp() from public;

drop trigger if exists rr_quote_chase_stamp on public.quote_chase_log;
create trigger rr_quote_chase_stamp before insert or update on public.quote_chase_log
  for each row execute function public.rr_quote_chase_stamp();

drop trigger if exists rr_quote_chase_stamp on public.quote_chase_tasks;
create trigger rr_quote_chase_stamp before insert or update of quotation_id on public.quote_chase_tasks
  for each row execute function public.rr_quote_chase_stamp();

-- Finishing a task records when and who. The step itself never moves.
create or replace function public.rr_quote_chase_task_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.updated_at := now();
  if new.status in ('done', 'skipped') and old.status is distinct from new.status then
    new.done_at := now();
    new.done_by_email := coalesce(public.rr_current_email(), '');
  elsif new.status = 'open' then
    new.done_at := null;
    new.done_by_email := '';
  end if;
  new.step_day := old.step_day;
  new.kind := old.kind;
  return new;
end $$;

revoke all on function public.rr_quote_chase_task_stamp() from public;

drop trigger if exists rr_quote_chase_task_stamp on public.quote_chase_tasks;
create trigger rr_quote_chase_task_stamp before update on public.quote_chase_tasks
  for each row execute function public.rr_quote_chase_task_stamp();

------------------------------------------------------------
-- 5. Row level security
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['quote_chase_settings', 'quote_chase_log', 'quote_chase_tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    -- Older catch-up scripts add a blanket policy to every table; remove it here.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Authenticated users full access" on public.%I', t);

    execute format('drop policy if exists "Staff read" on public.%I', t);
    execute format(
      'create policy "Staff read" on public.%I for select to authenticated
         using (public.rr_is_staff())', t);

    execute format('drop policy if exists "Viewers read" on public.%I', t);
    execute format(
      'create policy "Viewers read" on public.%I for select to authenticated
         using (public.rr_current_role() = ''viewer'')', t);

    execute format('drop policy if exists "Managers delete" on public.%I', t);
    execute format(
      'create policy "Managers delete" on public.%I for delete to authenticated
         using (public.rr_is_manager_or_admin())', t);

    execute format('drop policy if exists "Tenant isolation" on public.%I', t);
    execute format(
      'create policy "Tenant isolation" on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id))', t);

    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
    ) then
      execute format('drop trigger if exists rr_audit on public.%I', t);
      execute format(
        'create trigger rr_audit after insert or update or delete on public.%I
           for each row execute function public.rr_audit_trigger()', t);
    end if;
  end loop;
end $$;

-- Schedule: admin / manager change it.
drop policy if exists "Staff insert" on public.quote_chase_settings;
drop policy if exists "Managers insert" on public.quote_chase_settings;
create policy "Managers insert" on public.quote_chase_settings for insert to authenticated
  with check (public.rr_is_manager_or_admin());
drop policy if exists "Staff update" on public.quote_chase_settings;
drop policy if exists "Managers update" on public.quote_chase_settings;
create policy "Managers update" on public.quote_chase_settings for update to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Follow-up log: sales and up add; only admin / manager correct an entry.
drop policy if exists "Staff insert" on public.quote_chase_log;
create policy "Staff insert" on public.quote_chase_log for insert to authenticated
  with check (public.rr_is_staff());
drop policy if exists "Staff update" on public.quote_chase_log;
drop policy if exists "Managers update" on public.quote_chase_log;
create policy "Managers update" on public.quote_chase_log for update to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Tasks: sales and up create (when a quote reaches a step) and work them.
drop policy if exists "Staff insert" on public.quote_chase_tasks;
create policy "Staff insert" on public.quote_chase_tasks for insert to authenticated
  with check (public.rr_is_staff());
drop policy if exists "Staff update" on public.quote_chase_tasks;
create policy "Staff update" on public.quote_chase_tasks for update to authenticated
  using (public.rr_is_staff()) with check (public.rr_is_staff());

------------------------------------------------------------
-- 6. Sales lock: a locked Sales user reaches only follow-ups and tasks of
--    quotes that are theirs (rr_sales_quote_ids, 20261332090000). The schedule
--    is not money and stays readable.
------------------------------------------------------------
do $$
declare
  t text;
  rule text := 'not (select public.rr_sales_locked()) or quotation_id = any ((select public.rr_sales_quote_ids())::uuid[])';
begin
  if to_regprocedure('public.rr_sales_locked()') is null or to_regprocedure('public.rr_sales_quote_ids()') is null then
    raise notice 'quote chase: Sales lock helpers missing (run sales-own-clients.sql first); lock skipped';
    return;
  end if;
  foreach t in array array['quote_chase_log', 'quote_chase_tasks'] loop
    execute format('drop policy if exists "Sales lock (read)" on public.%I', t);
    execute format('drop policy if exists "Sales lock (add)" on public.%I', t);
    execute format('drop policy if exists "Sales lock (change)" on public.%I', t);
    execute format('drop policy if exists "Sales lock (remove)" on public.%I', t);
    execute format('create policy "Sales lock (read)" on public.%I as restrictive for select to authenticated using (%s)', t, rule);
    execute format('create policy "Sales lock (add)" on public.%I as restrictive for insert to authenticated with check (%s)', t, rule);
    execute format('create policy "Sales lock (change)" on public.%I as restrictive for update to authenticated using (%s) with check (%s)', t, rule, rule);
    execute format('create policy "Sales lock (remove)" on public.%I as restrictive for delete to authenticated using (%s)', t, rule);
  end loop;
end $$;

------------------------------------------------------------
-- 7. AI connector (MCP) limits
------------------------------------------------------------
-- The general MCP loops (20261323090000, 20261324090000, 20261325090000) ran
-- before these tables existed, so their policies are added here with the same
-- names and the same meaning those files now give these tables.
do $$
declare
  t text;
begin
  if to_regprocedure('public.rr_mcp_key_id()') is null then
    return;
  end if;
  foreach t in array array['quote_chase_settings', 'quote_chase_log', 'quote_chase_tasks'] loop
    execute format('drop policy if exists "MCP never deletes" on public.%I', t);
    execute format(
      'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
         using (public.rr_mcp_key_id() is null)', t);
  end loop;

  -- Standard keys may add follow-ups and change tasks, nothing else.
  execute 'drop policy if exists "MCP adds only leads and notes" on public.quote_chase_settings';
  execute 'drop policy if exists "MCP adds only leads and notes" on public.quote_chase_tasks';
  execute 'drop policy if exists "MCP adds only leads and notes" on public.quote_chase_log';
  execute 'drop policy if exists "MCP changes only deals" on public.quote_chase_settings';
  execute 'drop policy if exists "MCP changes only deals" on public.quote_chase_log';
  execute 'drop policy if exists "MCP changes only deals" on public.quote_chase_tasks';
  if to_regprocedure('public.rr_mcp_admin_key()') is not null then
    execute 'create policy "MCP adds only leads and notes" on public.quote_chase_settings as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
    execute 'create policy "MCP adds only leads and notes" on public.quote_chase_tasks as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
    execute 'create policy "MCP changes only deals" on public.quote_chase_settings as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
    execute 'create policy "MCP changes only deals" on public.quote_chase_log as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
  else
    execute 'create policy "MCP adds only leads and notes" on public.quote_chase_settings as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null)';
    execute 'create policy "MCP adds only leads and notes" on public.quote_chase_tasks as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null)';
    execute 'create policy "MCP changes only deals" on public.quote_chase_settings as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null)';
    execute 'create policy "MCP changes only deals" on public.quote_chase_log as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null)';
  end if;

  -- Whatever a key's scope, the AI never changes the schedule, never edits a
  -- follow-up and never creates tasks (these names are not used by the loops).
  execute 'drop policy if exists "AI never changes chase settings" on public.quote_chase_settings';
  execute 'create policy "AI never changes chase settings" on public.quote_chase_settings as restrictive for all to authenticated
             using (true) with check (public.rr_mcp_key_id() is null)';
  execute 'drop policy if exists "AI never edits chase notes" on public.quote_chase_log';
  execute 'create policy "AI never edits chase notes" on public.quote_chase_log as restrictive for update to authenticated
             using (public.rr_mcp_key_id() is null)';
  execute 'drop policy if exists "AI never adds chase tasks" on public.quote_chase_tasks';
  execute 'create policy "AI never adds chase tasks" on public.quote_chase_tasks as restrictive for insert to authenticated
             with check (public.rr_mcp_key_id() is null)';

  -- Keys with departments: these follow quotes (sales, finance read them;
  -- logging a follow-up or finishing a task needs only quote read reach).
  if to_regprocedure('public.rr_mcp_dept_allows(text, boolean)') is not null then
    foreach t in array array['quote_chase_settings', 'quote_chase_log', 'quote_chase_tasks'] loop
      execute format('drop policy if exists "MCP department reach" on public.%I', t);
      execute format('drop policy if exists "MCP department reach (add)" on public.%I', t);
      execute format('drop policy if exists "MCP department reach (change)" on public.%I', t);
      execute format('drop policy if exists "MCP department reach (remove)" on public.%I', t);
      execute format(
        'create policy "MCP department reach" on public.%I as restrictive for select to authenticated
           using ((select public.rr_mcp_dept_allows(''quotations'', false)))', t);
      execute format(
        'create policy "MCP department reach (add)" on public.%I as restrictive for insert to authenticated
           with check ((select public.rr_mcp_dept_allows(''quotations'', false)))', t);
      execute format(
        'create policy "MCP department reach (change)" on public.%I as restrictive for update to authenticated
           using ((select public.rr_mcp_dept_allows(''quotations'', false)))
           with check ((select public.rr_mcp_dept_allows(''quotations'', false)))', t);
      execute format(
        'create policy "MCP department reach (remove)" on public.%I as restrictive for delete to authenticated
           using ((select public.rr_mcp_dept_allows(''quotations'', false)))', t);
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
