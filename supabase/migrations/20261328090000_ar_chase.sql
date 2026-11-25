-- Overdue invoice chasing (HighMast improvement brief, fix 1, Alfred 2026-11-25).
--
-- Three new tables, nothing else changes. Invoice numbers, totals and payments
-- are never touched.
--
-- * ar_chase_settings   one row per tenant: the escalation schedule.
--                       Default (no row): reminders at 1, 7, 14 and 30 days
--                       overdue, escalate to the owner at 45 days.
-- * invoice_chase_log   every chase of an invoice: date, channel (email, call,
--                       WhatsApp, visit), contact, note, promised payment date
--                       and who logged it. Added from the invoice page, the
--                       aging page or the AI connector (add_invoice_chase_note).
-- * invoice_chase_tasks the follow-up task for each schedule step reached
--                       (one per invoice and step). Tasks carry no message:
--                       the app shows a draft and a person presses send.
--                       Nothing here ever emails or WhatsApps a client.
--
-- Access (same as invoices):
--   admin / manager / sales  read; add chase notes; work tasks
--   viewer                   read only
--   staff                    no access (they cannot see invoices either)
--   chase settings           admin / manager change them
--   change or remove a chase note, remove a task: admin / manager only
-- Plus tenant isolation. The tenant always comes from the invoice.
--
-- AI connector keys: may read all three, add chase notes and complete tasks.
-- They never change chase settings, never edit or remove a chase note and
-- never add tasks. Keys with departments reach them like invoices
-- (finance, sales).
--
-- Safe to re-run.
--
-- To reverse:
--   drop table if exists public.invoice_chase_tasks;
--   drop table if exists public.invoice_chase_log;
--   drop table if exists public.ar_chase_settings;
--   drop function if exists public.rr_ar_chase_stamp();
--   drop function if exists public.rr_ar_chase_task_stamp();
--   drop function if exists public.rr_ar_valid_days(integer[]);

do $$
begin
  if to_regclass('public.invoices') is null or to_regclass('public.tenants') is null then
    raise exception 'Run the platform tenancy migration first (invoices or tenants is missing).';
  end if;
end $$;

------------------------------------------------------------
-- 1. Escalation schedule per tenant
------------------------------------------------------------
create or replace function public.rr_ar_valid_days(p_days integer[])
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(p_days) between 1 and 12, false)
     and coalesce((select bool_and(d between 1 and 365) from unnest(p_days) d), false)
$$;

create table if not exists public.ar_chase_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  reminder_days integer[] not null default '{1,7,14,30}'
    check (public.rr_ar_valid_days(reminder_days)),
  escalate_days integer not null default 45 check (escalate_days between 1 and 365),
  -- Who gets the escalation task. Null: the owners (admins) pick it up.
  escalate_to_user_id uuid references public.app_users (id) on delete set null,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.ar_chase_settings is
  'Overdue invoice chasing: reminder days and the escalate-to-owner day, per tenant. No row = 1, 7, 14, 30 and escalate at 45.';

------------------------------------------------------------
-- 2. Chase log
------------------------------------------------------------
create table if not exists public.invoice_chase_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  chased_on date not null default current_date,
  channel text not null check (channel in ('email', 'call', 'whatsapp', 'visit')),
  contact text not null default '' check (length(contact) <= 200),
  note text not null default '' check (length(note) <= 4000),
  promised_date date,
  created_by uuid references public.app_users (id) on delete set null,
  created_by_email text not null default '',
  source text not null default 'app' check (source in ('app', 'ai')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (promised_date is null or promised_date >= chased_on),
  check (length(trim(note)) > 0 or promised_date is not null)
);

create index if not exists invoice_chase_log_invoice_idx
  on public.invoice_chase_log (invoice_id, chased_on desc, created_at desc);
create index if not exists invoice_chase_log_tenant_idx
  on public.invoice_chase_log (tenant_id, chased_on desc);

comment on table public.invoice_chase_log is
  'Every chase of an overdue invoice: date, channel, contact, note, promised payment date, who. A passed promise with money still owing is a broken promise.';

------------------------------------------------------------
-- 3. Chase tasks (one per invoice and schedule step)
------------------------------------------------------------
create table if not exists public.invoice_chase_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  step_day integer not null check (step_day between 1 and 365),
  kind text not null default 'reminder' check (kind in ('reminder', 'escalate')),
  due_on date not null,
  assigned_to uuid references public.app_users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'skipped', 'closed')),
  outcome text not null default '' check (length(outcome) <= 2000),
  done_at timestamptz,
  done_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_chase_tasks_step_key unique (invoice_id, step_day)
);

create index if not exists invoice_chase_tasks_open_idx
  on public.invoice_chase_tasks (tenant_id, status, due_on);

comment on table public.invoice_chase_tasks is
  'Follow-up task for each chase step an overdue invoice reaches (reminder or escalate to owner). Drafts only: a person sends anything.';

------------------------------------------------------------
-- 4. Stamps: tenant from the invoice, who from the session
------------------------------------------------------------
create or replace function public.rr_ar_chase_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  t uuid;
begin
  select i.tenant_id into t from public.invoices i where i.id = new.invoice_id;
  if t is null then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  new.tenant_id := t;
  if tg_table_name = 'invoice_chase_log' then
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
      raise exception 'The chase date cannot be in the future.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.rr_ar_chase_stamp() from public;

drop trigger if exists rr_ar_chase_stamp on public.invoice_chase_log;
create trigger rr_ar_chase_stamp before insert or update on public.invoice_chase_log
  for each row execute function public.rr_ar_chase_stamp();

drop trigger if exists rr_ar_chase_stamp on public.invoice_chase_tasks;
create trigger rr_ar_chase_stamp before insert or update of invoice_id on public.invoice_chase_tasks
  for each row execute function public.rr_ar_chase_stamp();

-- Finishing a task records when and who.
create or replace function public.rr_ar_chase_task_stamp()
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
  -- The step itself never moves.
  new.step_day := old.step_day;
  new.kind := old.kind;
  return new;
end $$;

revoke all on function public.rr_ar_chase_task_stamp() from public;

drop trigger if exists rr_ar_chase_task_stamp on public.invoice_chase_tasks;
create trigger rr_ar_chase_task_stamp before update on public.invoice_chase_tasks
  for each row execute function public.rr_ar_chase_task_stamp();

------------------------------------------------------------
-- 5. Row level security
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ar_chase_settings', 'invoice_chase_log', 'invoice_chase_tasks'] loop
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

-- Settings: admin / manager change them.
drop policy if exists "Staff insert" on public.ar_chase_settings;
drop policy if exists "Managers insert" on public.ar_chase_settings;
create policy "Managers insert" on public.ar_chase_settings for insert to authenticated
  with check (public.rr_is_manager_or_admin());
drop policy if exists "Staff update" on public.ar_chase_settings;
drop policy if exists "Managers update" on public.ar_chase_settings;
create policy "Managers update" on public.ar_chase_settings for update to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Chase log: sales and up add; only admin / manager correct an entry.
drop policy if exists "Staff insert" on public.invoice_chase_log;
create policy "Staff insert" on public.invoice_chase_log for insert to authenticated
  with check (public.rr_is_staff());
drop policy if exists "Staff update" on public.invoice_chase_log;
drop policy if exists "Managers update" on public.invoice_chase_log;
create policy "Managers update" on public.invoice_chase_log for update to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Tasks: sales and up create (when an invoice reaches a step) and work them.
drop policy if exists "Staff insert" on public.invoice_chase_tasks;
create policy "Staff insert" on public.invoice_chase_tasks for insert to authenticated
  with check (public.rr_is_staff());
drop policy if exists "Staff update" on public.invoice_chase_tasks;
create policy "Staff update" on public.invoice_chase_tasks for update to authenticated
  using (public.rr_is_staff()) with check (public.rr_is_staff());

------------------------------------------------------------
-- 6. AI connector (MCP) limits
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
  foreach t in array array['ar_chase_settings', 'invoice_chase_log', 'invoice_chase_tasks'] loop
    execute format('drop policy if exists "MCP never deletes" on public.%I', t);
    execute format(
      'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
         using (public.rr_mcp_key_id() is null)', t);
  end loop;

  -- Standard keys may add chase notes and change tasks, nothing else.
  execute 'drop policy if exists "MCP adds only leads and notes" on public.ar_chase_settings';
  execute 'drop policy if exists "MCP adds only leads and notes" on public.invoice_chase_tasks';
  execute 'drop policy if exists "MCP adds only leads and notes" on public.invoice_chase_log';
  execute 'drop policy if exists "MCP changes only deals" on public.ar_chase_settings';
  execute 'drop policy if exists "MCP changes only deals" on public.invoice_chase_log';
  execute 'drop policy if exists "MCP changes only deals" on public.invoice_chase_tasks';
  if to_regprocedure('public.rr_mcp_admin_key()') is not null then
    execute 'create policy "MCP adds only leads and notes" on public.ar_chase_settings as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
    execute 'create policy "MCP adds only leads and notes" on public.invoice_chase_tasks as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
    execute 'create policy "MCP changes only deals" on public.ar_chase_settings as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
    execute 'create policy "MCP changes only deals" on public.invoice_chase_log as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())';
  else
    execute 'create policy "MCP adds only leads and notes" on public.ar_chase_settings as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null)';
    execute 'create policy "MCP adds only leads and notes" on public.invoice_chase_tasks as restrictive for insert to authenticated
               with check (public.rr_mcp_key_id() is null)';
    execute 'create policy "MCP changes only deals" on public.ar_chase_settings as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null)';
    execute 'create policy "MCP changes only deals" on public.invoice_chase_log as restrictive for update to authenticated
               using (public.rr_mcp_key_id() is null)';
  end if;

  -- Whatever a key's scope, the AI never changes the schedule, never edits a
  -- chase note and never creates tasks (these names are not used by the loops).
  execute 'drop policy if exists "AI never changes chase settings" on public.ar_chase_settings';
  execute 'create policy "AI never changes chase settings" on public.ar_chase_settings as restrictive for all to authenticated
             using (true) with check (public.rr_mcp_key_id() is null)';
  execute 'drop policy if exists "AI never edits chase notes" on public.invoice_chase_log';
  execute 'create policy "AI never edits chase notes" on public.invoice_chase_log as restrictive for update to authenticated
             using (public.rr_mcp_key_id() is null)';
  execute 'drop policy if exists "AI never adds chase tasks" on public.invoice_chase_tasks';
  execute 'create policy "AI never adds chase tasks" on public.invoice_chase_tasks as restrictive for insert to authenticated
             with check (public.rr_mcp_key_id() is null)';

  -- Keys with departments: these follow invoices (finance, sales read them;
  -- logging a chase or finishing a task needs only invoice read reach).
  if to_regprocedure('public.rr_mcp_dept_allows(text, boolean)') is not null then
    foreach t in array array['ar_chase_settings', 'invoice_chase_log', 'invoice_chase_tasks'] loop
      execute format('drop policy if exists "MCP department reach" on public.%I', t);
      execute format('drop policy if exists "MCP department reach (add)" on public.%I', t);
      execute format('drop policy if exists "MCP department reach (change)" on public.%I', t);
      execute format('drop policy if exists "MCP department reach (remove)" on public.%I', t);
      execute format(
        'create policy "MCP department reach" on public.%I as restrictive for select to authenticated
           using ((select public.rr_mcp_dept_allows(''invoices'', false)))', t);
      execute format(
        'create policy "MCP department reach (add)" on public.%I as restrictive for insert to authenticated
           with check ((select public.rr_mcp_dept_allows(''invoices'', false)))', t);
      execute format(
        'create policy "MCP department reach (change)" on public.%I as restrictive for update to authenticated
           using ((select public.rr_mcp_dept_allows(''invoices'', false)))
           with check ((select public.rr_mcp_dept_allows(''invoices'', false)))', t);
      execute format(
        'create policy "MCP department reach (remove)" on public.%I as restrictive for delete to authenticated
           using ((select public.rr_mcp_dept_allows(''invoices'', false)))', t);
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
