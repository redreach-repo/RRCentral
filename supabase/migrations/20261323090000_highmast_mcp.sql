-- HighMast MCP server (Edge Function highmast-mcp) for AI assistants such as Grok Bot.
--
-- * `mcp_keys`: one row per connector key. Only a SHA-256 hash of the key is
--   kept; the key itself is shown once, on the AI connector page, when an
--   admin creates it. Each key acts as one active team member whose role is
--   sales (default), staff or viewer, so the normal row level security rules
--   decide what the AI can see. Admin and manager are refused on purpose.
-- * `rr_mcp_resolve_key(hash)`: the function's only way in. Checks the key,
--   counts the call (60 a minute per key) and returns who the key acts as.
-- * `rr_mcp_log_call(...)`: every tool call goes to audit_log (operation
--   MCP_CALL, table mcp_tool_call) with the key name.
-- * Database-level safety for AI sessions (tokens carrying the hm_mcp_key
--   claim), on top of what the function itself allows:
--     - nothing can be deleted, on any table;
--     - HR, payroll, secrets, settings, keys and the audit log cannot be read;
--     - only the lead, note, follow-up and stage tables can be written.
--   People signed in to the app are not affected by any of this.
--
-- Changes no existing data. Safe to re-run.
-- NOTE: 20260926090000_security_rls.sql drops every policy when re-run. If it
-- is ever re-run, re-run this file afterwards.
--
-- To reverse:
--   drop function if exists public.rr_mcp_resolve_key(text);
--   drop function if exists public.rr_mcp_log_call(text, jsonb, boolean, text);
--   drop table if exists public.mcp_keys;
--   (the "MCP ..." policies can stay: they only ever match AI sessions)

-- Quiet the "does not exist, skipping" notices from the policy loop below.
set client_min_messages = warning;

------------------------------------------------------------
-- 1. Which AI key is this session using? (null for people)
------------------------------------------------------------
create or replace function public.rr_mcp_key_id()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  raw text := nullif(current_setting('request.jwt.claims', true), '');
  v text;
begin
  if raw is null then
    return null;
  end if;
  v := raw::jsonb ->> 'hm_mcp_key';
  if v is null or v !~ '^[0-9a-f-]{36}$' then
    return null;
  end if;
  return v::uuid;
exception when others then
  return null;
end $$;

revoke all on function public.rr_mcp_key_id() from public;
grant execute on function public.rr_mcp_key_id() to anon, authenticated;

------------------------------------------------------------
-- 2. Keys
------------------------------------------------------------
create table if not exists public.mcp_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and length(name) <= 80),
  key_prefix text not null default '',
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  role text not null default 'sales' check (role in ('sales', 'staff', 'viewer')),
  acts_as_user_id uuid not null references public.app_users(id) on delete cascade,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  -- Rate limit: calls counted in the current one-minute window.
  rate_window_start timestamptz,
  rate_count integer not null default 0
);
create index if not exists mcp_keys_active_idx on public.mcp_keys (key_hash) where revoked_at is null;

-- Same company as the member the key acts as, when the multi-company columns exist.
do $$
begin
  if to_regclass('public.tenants') is not null then
    alter table public.mcp_keys add column if not exists tenant_id uuid
      references public.tenants(id) on delete cascade
      default 'a0000000-0000-4000-8000-000000000001'::uuid;
  end if;
end $$;

alter table public.mcp_keys enable row level security;
revoke all on public.mcp_keys from anon, authenticated;
-- Admins list, create and revoke (an update of revoked_at). Never delete: revoked keys stay for the audit trail.
grant select, insert, update (name, revoked_at) on public.mcp_keys to authenticated;

-- Never the blanket policies older migrations add to every table when re-run
-- ("Staff full access", "Viewers read", ...): only the admin policies below.
do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'mcp_keys' and permissive = 'PERMISSIVE'
      and policyname not in ('Admins read AI keys', 'Admins create AI keys', 'Admins revoke AI keys')
  loop
    execute format('drop policy if exists %I on public.mcp_keys', p.policyname);
  end loop;
end $$;

drop policy if exists "Admins read AI keys" on public.mcp_keys;
drop policy if exists "Admins create AI keys" on public.mcp_keys;
drop policy if exists "Admins revoke AI keys" on public.mcp_keys;
create policy "Admins read AI keys" on public.mcp_keys
  for select to authenticated using (public.rr_is_admin());
create policy "Admins create AI keys" on public.mcp_keys
  for insert to authenticated
  with check (
    public.rr_is_admin()
    and revoked_at is null
    and rate_count = 0
    and exists (
      select 1 from public.app_users u
      where u.id = acts_as_user_id and u.active and u.role = mcp_keys.role
    )
  );
create policy "Admins revoke AI keys" on public.mcp_keys
  for update to authenticated
  using (public.rr_is_admin())
  with check (public.rr_is_admin());

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mcp_keys' and column_name = 'tenant_id'
  ) and exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_same_tenant'
  ) then
    execute 'drop policy if exists "Tenant isolation" on public.mcp_keys';
    execute 'create policy "Tenant isolation" on public.mcp_keys as restrictive for all to authenticated
               using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id))';
  end if;
end $$;

comment on table public.mcp_keys is
  'AI connector (MCP) keys: SHA-256 hash only, each acts as one sales/staff/viewer member. Admin only.';

------------------------------------------------------------
-- 3. Check a key and count the call
------------------------------------------------------------
-- Called by the highmast-mcp function with the public (anon) key and the
-- SHA-256 hash of the caller's key. Returns one row when the key may be used.
-- `allowed` is false when the key went over 60 calls in this minute.
-- Dropped first: 20261324090000_highmast_mcp_admin.sql adds a scope column to
-- the result, and a re-run of this file must still apply (re-run that file after).
drop function if exists public.rr_mcp_resolve_key(text);
create function public.rr_mcp_resolve_key(p_key_hash text)
returns table (
  key_id uuid,
  key_name text,
  role text,
  member_id uuid,
  member_name text,
  member_email text,
  auth_user_id uuid,
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  k public.mcp_keys%rowtype;
  u public.app_users%rowtype;
  au uuid;
  w timestamptz := date_trunc('minute', now());
  n integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select * into k from public.mcp_keys m where m.key_hash = p_key_hash and m.revoked_at is null for update;
  if not found then
    return;
  end if;
  select * into u from public.app_users a where a.id = k.acts_as_user_id;
  -- The member must still be active and still have the key's role (no quiet promotion to admin).
  if not found or not u.active or u.role is distinct from k.role or k.role not in ('sales', 'staff', 'viewer') then
    return;
  end if;
  select x.id into au from auth.users x
  where lower(x.email) = lower(u.email) and x.email_confirmed_at is not null
  limit 1;
  if au is null then
    return;
  end if;

  n := case when k.rate_window_start = w then k.rate_count + 1 else 1 end;
  update public.mcp_keys
     set rate_window_start = w,
         rate_count = n,
         last_used_at = now()
   where id = k.id;

  key_id := k.id;
  key_name := k.name;
  role := k.role;
  member_id := u.id;
  member_name := u.name;
  member_email := lower(u.email);
  auth_user_id := au;
  allowed := n <= 60;
  retry_after_seconds := greatest(1, 60 - extract(second from now())::integer);
  return next;
end $$;

revoke all on function public.rr_mcp_resolve_key(text) from public;
grant execute on function public.rr_mcp_resolve_key(text) to anon, authenticated;

------------------------------------------------------------
-- 4. Audit every tool call
------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log
  add constraint audit_log_operation_check
  check (operation in ('INSERT', 'UPDATE', 'DELETE', 'MCP_CALL'));

-- Only an AI session can write its own call, and only for its own live key.
create or replace function public.rr_mcp_log_call(p_tool text, p_args jsonb, p_ok boolean, p_error text default '')
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  kid uuid := public.rr_mcp_key_id();
  k public.mcp_keys%rowtype;
  actor text;
begin
  if kid is null then
    raise exception 'Only AI connector sessions can log tool calls' using errcode = '42501';
  end if;
  select * into k from public.mcp_keys m where m.id = kid and m.revoked_at is null;
  if not found then
    raise exception 'AI connector key not found or revoked' using errcode = '42501';
  end if;
  select lower(x.email) into actor from auth.users x where x.id = auth.uid();
  insert into public.audit_log (table_name, operation, row_id, actor_email, changed_fields, old_data, new_data)
  values (
    'mcp_tool_call',
    'MCP_CALL',
    k.id::text,
    coalesce(actor, '') || ' (AI key: ' || k.name || ')',
    array[left(coalesce(p_tool, ''), 60)],
    null,
    jsonb_build_object(
      'key_id', k.id,
      'key_name', k.name,
      'role', k.role,
      'tool', left(coalesce(p_tool, ''), 60),
      'args', coalesce(p_args, '{}'::jsonb),
      'ok', coalesce(p_ok, false),
      'error', left(coalesce(p_error, ''), 500)
    )
  );
end $$;

revoke all on function public.rr_mcp_log_call(text, jsonb, boolean, text) from public;
grant execute on function public.rr_mcp_log_call(text, jsonb, boolean, text) to authenticated;

------------------------------------------------------------
-- 5. Database-level limits for AI sessions
------------------------------------------------------------
-- Restrictive policies: a row must pass them as well as the normal ones.
-- They only bite when rr_mcp_key_id() is set, which is never true for
-- people using the app.
do $$
declare
  t record;
  -- Never readable by an AI key, whatever its role.
  hidden text[] := array[
    'hr_employees', 'hr_attendance_days', 'hr_leave_requests',
    'payroll_runs', 'payroll_lines', 'payroll_exports',
    'fle_access_log', 'app_settings', 'audit_log',
    'api_keys', 'webhook_endpoints', 'webhook_delivery_attempts', 'mcp_keys',
    'mail_accounts', 'gmail_connection', 'drive_connection',
    'tenant_app_identities', 'mfa_passkey_stubs', 'rate_limit_buckets'
  ];
  -- The only tables an AI key may add rows to.
  insertable text[] := array[
    'accounts', 'account_contacts', 'account_activities',
    'crm', 'follow_up_updates', 'sales_deals', 'ctrm_deals', 'ctrm_deal_stage_changes',
    -- Overdue invoice chasing (20261328090000_ar_chase.sql): chase notes only.
    'invoice_chase_log'
  ];
  -- The only tables an AI key may change (stage and next follow-up on deals).
  updatable text[] := array['crm', 'sales_deals', 'ctrm_deals', 'invoice_chase_tasks'];
begin
  for t in
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('drop policy if exists "MCP never deletes" on public.%I', t.name);
    execute format(
      'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
         using (public.rr_mcp_key_id() is null)', t.name);

    execute format('drop policy if exists "MCP cannot read" on public.%I', t.name);
    if t.name = any (hidden) then
      execute format(
        'create policy "MCP cannot read" on public.%I as restrictive for select to authenticated
           using (public.rr_mcp_key_id() is null)', t.name);
    end if;

    execute format('drop policy if exists "MCP adds only leads and notes" on public.%I', t.name);
    if not (t.name = any (insertable)) then
      execute format(
        'create policy "MCP adds only leads and notes" on public.%I as restrictive for insert to authenticated
           with check (public.rr_mcp_key_id() is null)', t.name);
    end if;

    execute format('drop policy if exists "MCP changes only deals" on public.%I', t.name);
    if not (t.name = any (updatable)) then
      execute format(
        'create policy "MCP changes only deals" on public.%I as restrictive for update to authenticated
           using (public.rr_mcp_key_id() is null)', t.name);
    end if;
  end loop;
end $$;

reset client_min_messages;

notify pgrst, 'reload schema';
