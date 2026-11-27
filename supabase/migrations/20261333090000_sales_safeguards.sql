-- Sales lockdown, PR 3: safeguards.
--
--   1. export_log + rr_log_export(): every CSV download is logged. A Sales user
--      needs the export.csv switch, and has a daily cap (app setting
--      salesExportDailyCap, default 10). Admins and managers read the log.
--   2. sign_in_log + rr_record_sign_in(): the app records each sign in (time,
--      browser, whether two step was used). Admins read it on Settings, Users.
--   3. rr_offboard_user(leaver, hand_to): the leaver button. Switches the person
--      off, hands their accounts and leads to someone else, removes their
--      switches and project places, revokes their AI connector keys and ends
--      their sign in sessions. Admins only.
--
-- Safe to re-run. Needs 20261332090000_sales_own_clients.sql.

do $$
begin
  if to_regclass('public.user_permissions') is null then
    raise exception 'Sales safeguards need sales-own-clients.sql (20261332090000) first';
  end if;
end $$;

------------------------------------------------------------
-- 1. Export log and daily cap
------------------------------------------------------------
create table if not exists public.export_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  user_id uuid references public.app_users (id) on delete set null,
  user_email text not null default '',
  filename text not null default '',
  row_count integer not null default 0,
  allowed boolean not null default true,
  at timestamptz not null default now()
);

create index if not exists export_log_user_at_idx on public.export_log (user_id, at desc);

comment on table public.export_log is
  'Every CSV download (and every one refused). Written only by rr_log_export().';

create or replace function public.rr_sales_export_cap()
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select nullif(btrim(s.value), '')::integer from public.app_settings s
     where s.key = 'salesExportDailyCap' and btrim(s.value) ~ '^[0-9]+$'),
    10
  )
$$;

-- Asks before a download and logs it. Returns {allowed, reason, used, cap}.
create or replace function public.rr_log_export(p_filename text, p_rows integer default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  me uuid := public.rr_current_user_id();
  my_role text := public.rr_current_role();
  cap integer := public.rr_sales_export_cap();
  used integer := 0;
  ok boolean := true;
  why text := '';
begin
  if me is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_member', 'used', 0, 'cap', 0);
  end if;
  if my_role = 'sales' then
    if not public.rr_has_permission('export.csv') then
      ok := false;
      why := 'switched_off';
    else
      select count(*) into used from public.export_log
      where user_id = me and allowed and at >= date_trunc('day', now());
      if used >= cap then
        ok := false;
        why := 'daily_cap';
      end if;
    end if;
  end if;
  insert into public.export_log (tenant_id, user_id, user_email, filename, row_count, allowed)
  values (
    coalesce(public.rr_my_tenant_id(), 'a0000000-0000-4000-8000-000000000001'::uuid),
    me, coalesce(public.rr_current_email(), ''), left(coalesce(p_filename, ''), 200),
    greatest(coalesce(p_rows, 0), 0), ok
  );
  return jsonb_build_object(
    'allowed', ok, 'reason', why,
    'used', used + case when ok then 1 else 0 end,
    'cap', case when my_role = 'sales' then cap else null end
  );
end;
$$;

revoke all on function public.rr_sales_export_cap() from public, anon;
revoke all on function public.rr_log_export(text, integer) from public, anon;
grant execute on function public.rr_sales_export_cap() to authenticated;
grant execute on function public.rr_log_export(text, integer) to authenticated;

------------------------------------------------------------
-- 2. Sign in history
------------------------------------------------------------
create table if not exists public.sign_in_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  user_id uuid references public.app_users (id) on delete cascade,
  user_email text not null default '',
  user_agent text not null default '',
  two_step boolean not null default false,
  at timestamptz not null default now()
);

create index if not exists sign_in_log_user_at_idx on public.sign_in_log (user_id, at desc);

comment on table public.sign_in_log is
  'One row per sign in, written by the app through rr_record_sign_in(). Admins read it.';

create or replace function public.rr_record_sign_in(p_user_agent text default '', p_two_step boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  me uuid := public.rr_current_user_id();
begin
  if me is null then
    return;
  end if;
  -- One row per sign in: ignore repeats within a minute (page reloads).
  if exists (
    select 1 from public.sign_in_log
    where user_id = me and at > now() - interval '1 minute'
  ) then
    return;
  end if;
  insert into public.sign_in_log (tenant_id, user_id, user_email, user_agent, two_step)
  values (
    coalesce(public.rr_my_tenant_id(), 'a0000000-0000-4000-8000-000000000001'::uuid),
    me, coalesce(public.rr_current_email(), ''), left(coalesce(p_user_agent, ''), 300),
    coalesce(p_two_step, false)
  );
  -- Keep a year.
  delete from public.sign_in_log where user_id = me and at < now() - interval '365 days';
end;
$$;

revoke all on function public.rr_record_sign_in(text, boolean) from public, anon;
grant execute on function public.rr_record_sign_in(text, boolean) to authenticated;

------------------------------------------------------------
-- RLS on the two logs: read by admins (and managers for exports), written
-- only by the functions above.
------------------------------------------------------------
alter table public.export_log enable row level security;
alter table public.sign_in_log enable row level security;
revoke all on public.export_log, public.sign_in_log from anon;
revoke insert, update, delete on public.export_log, public.sign_in_log from authenticated;
grant select on public.export_log, public.sign_in_log to authenticated;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['export_log', 'sign_in_log'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy "Tenant isolation" on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id))', t);
  end loop;
end $$;

create policy "Managers read exports" on public.export_log
  for select to authenticated using (public.rr_is_manager_or_admin());
create policy "Admins read sign ins" on public.sign_in_log
  for select to authenticated using (public.rr_is_admin());

------------------------------------------------------------
-- 3. Leaver button
------------------------------------------------------------
create or replace function public.rr_offboard_user(p_user uuid, p_hand_to uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  leaver public.app_users%rowtype;
  heir public.app_users%rowtype;
  ids text[];
  heir_label text;
  n_accounts integer := 0;
  n_leads integer := 0;
  n_switches integer := 0;
  n_projects integer := 0;
  n_keys integer := 0;
  n_sessions integer := 0;
begin
  if not public.rr_is_admin() then
    raise exception 'Only an admin can sign someone out for good';
  end if;
  if p_user = public.rr_current_user_id() then
    raise exception 'You cannot use the leaver button on yourself';
  end if;
  select * into leaver from public.app_users where id = p_user;
  if not found or not public.rr_same_tenant(leaver.tenant_id) then
    raise exception 'Team member not found';
  end if;
  select * into heir from public.app_users where id = p_hand_to;
  if not found or not heir.active or not public.rr_same_tenant(heir.tenant_id) or heir.id = leaver.id then
    raise exception 'Choose an active team member to hand the clients to';
  end if;

  ids := array_remove(array[lower(btrim(leaver.email)), lower(btrim(coalesce(leaver.name, '')))], '');
  heir_label := coalesce(nullif(btrim(heir.name), ''), heir.email);

  update public.app_users set active = false where id = leaver.id;

  update public.accounts set owner_user_id = heir.id where owner_user_id = leaver.id;
  get diagnostics n_accounts = row_count;

  update public.crm set owner = heir_label where lower(btrim(owner)) = any (ids);
  get diagnostics n_leads = row_count;

  delete from public.user_permissions where user_id = leaver.id;
  get diagnostics n_switches = row_count;

  delete from public.delivery_project_members where user_id = leaver.id;
  get diagnostics n_projects = row_count;

  if to_regclass('public.mcp_keys') is not null then
    execute 'update public.mcp_keys set revoked_at = now() where acts_as_user_id = $1 and revoked_at is null'
      using leaver.id;
    get diagnostics n_keys = row_count;
  end if;

  -- End their sign in sessions (Supabase Auth). They cannot sign back in while switched off.
  if to_regclass('auth.sessions') is not null and to_regclass('auth.users') is not null then
    execute 'delete from auth.sessions s using auth.users u
             where s.user_id = u.id and lower(u.email) = lower($1)'
      using leaver.email;
    get diagnostics n_sessions = row_count;
  end if;

  return jsonb_build_object(
    'accounts', n_accounts, 'leads', n_leads, 'switches', n_switches,
    'projects', n_projects, 'ai_keys', n_keys, 'sessions', n_sessions,
    'handed_to', heir_label
  );
end;
$$;

revoke all on function public.rr_offboard_user(uuid, uuid) from public, anon;
grant execute on function public.rr_offboard_user(uuid, uuid) to authenticated;

------------------------------------------------------------
-- 4. AI connector (MCP): never reads into or writes the logs
------------------------------------------------------------
create or replace function public.rr_mcp_admin_never_write()
returns text[]
language sql
immutable
as $$
  select array[
    'app_users', 'app_settings', 'audit_log', 'fle_access_log', 'api_keys', 'mcp_keys',
    'webhook_endpoints', 'webhook_delivery_attempts', 'mail_accounts', 'mail_links',
    'gmail_connection', 'drive_connection', 'm365_connection', 'tenant_app_identities',
    'mfa_passkey_stubs', 'rate_limit_buckets', 'tenants', 'tenant_subscriptions',
    'tenant_country_packs', 'tenant_industry_packs', 'country_packs', 'industry_packs',
    'business_type_packs', 'numbering_sequences', 'pipelines', 'pipeline_stages',
    'record_rules', 'workflow_definitions', 'workflow_runs', 'custom_field_definitions',
    'sla_policies', 'retention_runs', 'event_outbox', 'dsr_requests',
    'hubspot_links', 'hubspot_sync_runs', 'usage_import_runs', 'digest_runs',
    'fireflies_webhook_events', 'fireflies_webhook_maps', 'ai_usage_log', 'app_errors',
    'activity_log', 'gl_accounts', 'user_permissions', 'delivery_project_members',
    'export_log', 'sign_in_log'
  ]::text[]
$$;

do $$
declare
  t text;
begin
  if to_regprocedure('public.rr_mcp_key_id()') is null then
    return;
  end if;
  foreach t in array array['export_log', 'sign_in_log'] loop
    execute format('drop policy if exists "AI never reads logs" on public.%I', t);
    execute format(
      'create policy "AI never reads logs" on public.%I as restrictive for all to authenticated
         using (public.rr_mcp_key_id() is null) with check (public.rr_mcp_key_id() is null)', t);
    execute format('drop policy if exists "MCP never deletes" on public.%I', t);
    execute format(
      'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
         using (public.rr_mcp_key_id() is null)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
