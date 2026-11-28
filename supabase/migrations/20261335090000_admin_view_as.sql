-- Admin "View as user": the owner opens RR Central as another team member to
-- see exactly what they see, without knowing their password and without
-- weakening anyone's two step sign in.
--
-- How it works:
--   1. An admin who has passed two step sign in calls rr_view_as_request(user,
--      reason). It checks the rules, logs the request in view_as_sessions and
--      returns a one time claim code (only its hash is stored).
--   2. The admin-view-as Edge Function (service role) checks the request is the
--      caller's, fresh and unused, and returns a one time sign in token for that
--      user (a Supabase magic link token; no email is sent).
--   3. The browser signs in with the token, then calls rr_view_as_claim(id,
--      code) as that user. This ties the request to that exact sign in session.
--   4. rr_view_as_active() tells the app it is a view as session (banner, and
--      two step is not asked, because the admin already passed it). Only the
--      bound session gets this; the user signing in themselves never does.
--   5. rr_view_as_end() ends it and deletes that sign in session. Expired ones
--      are ended and their sessions deleted whenever any view as call runs.
--
-- Rules: admins only, two step done (aal2), not yourself, not another admin,
-- active members of your own company only, 30 minutes, at most 10 per hour.
-- Admins read the history; nobody writes the table directly.
--
-- Safe to re-run.
--
-- To reverse:
--   drop function if exists public.rr_view_as_request(uuid, text);
--   drop function if exists public.rr_view_as_issue(uuid, text);
--   drop function if exists public.rr_view_as_claim(uuid, text);
--   drop function if exists public.rr_view_as_active();
--   drop function if exists public.rr_view_as_end(uuid);
--   drop function if exists public.rr_view_as_expire();
--   drop function if exists public.rr_jwt_claim(text);
--   drop table if exists public.view_as_sessions;

create table if not exists public.view_as_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  admin_user_id uuid references public.app_users (id) on delete set null,
  admin_email text not null default '',
  target_user_id uuid references public.app_users (id) on delete set null,
  target_email text not null default '',
  reason text not null default '' check (char_length(reason) <= 300),
  claim_hash text not null default '',
  auth_session_id text,
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 minutes',
  ended_at timestamptz,
  end_reason text not null default ''
);

create index if not exists view_as_sessions_admin_idx on public.view_as_sessions (admin_user_id, requested_at desc);
create index if not exists view_as_sessions_target_idx on public.view_as_sessions (target_user_id, requested_at desc);
create index if not exists view_as_sessions_session_idx on public.view_as_sessions (auth_session_id) where auth_session_id is not null;

comment on table public.view_as_sessions is
  'Every admin "View as user" session: who, as whom, why, when it started and ended. Written only by the rr_view_as_* functions.';

------------------------------------------------------------
-- A claim from the caller's sign in token (aal, session_id). Supabase puts the
-- whole token in request.jwt.claims; older setups (and the tests) set one
-- request.jwt.claim.<name> per claim.
------------------------------------------------------------
create or replace function public.rr_jwt_claim(p_name text)
returns text
language plpgsql
stable
as $$
declare
  v text;
begin
  begin
    v := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> p_name;
  exception when others then
    v := null;
  end;
  return coalesce(nullif(v, ''), nullif(current_setting('request.jwt.claim.' || p_name, true), ''));
end;
$$;
revoke all on function public.rr_jwt_claim(text) from public, anon;
grant execute on function public.rr_jwt_claim(text) to authenticated;

------------------------------------------------------------
-- End expired sessions and delete their sign in sessions.
------------------------------------------------------------
create or replace function public.rr_view_as_expire()
returns integer
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  n integer := 0;
  ids text[];
begin
  with gone as (
    update public.view_as_sessions
    set ended_at = now(), end_reason = case when claimed_at is null then 'not used' else 'time up' end
    where ended_at is null and expires_at <= now()
    returning auth_session_id
  )
  select array_agg(auth_session_id) filter (where auth_session_id is not null), count(*)
  into ids, n from gone;
  if ids is not null and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where id::text = any ($1)' using ids;
  end if;
  return coalesce(n, 0);
end;
$$;
revoke all on function public.rr_view_as_expire() from public, anon, authenticated;

------------------------------------------------------------
-- 1. Admin asks to view as someone
------------------------------------------------------------
create or replace function public.rr_view_as_request(p_target uuid, p_reason text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  me public.app_users%rowtype;
  who public.app_users%rowtype;
  code text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  recent integer;
  new_id uuid;
begin
  perform public.rr_view_as_expire();
  if not public.rr_is_admin() then
    raise exception 'Only an admin can view as another user';
  end if;
  if coalesce(public.rr_jwt_claim('aal'), '') <> 'aal2' then
    raise exception 'Finish two step sign in on your own account first';
  end if;
  select * into me from public.app_users where id = public.rr_current_user_id();
  select * into who from public.app_users where id = p_target;
  if not found or not who.active or not public.rr_same_tenant(who.tenant_id) then
    raise exception 'Team member not found or switched off';
  end if;
  if who.id = me.id then
    raise exception 'You are already signed in as yourself';
  end if;
  if who.role = 'admin' then
    raise exception 'View as is not available for other admins';
  end if;
  select count(*) into recent from public.view_as_sessions
  where admin_user_id = me.id and requested_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'Too many View as sessions in the last hour. Try again later.';
  end if;

  -- One at a time: close anything this admin left open.
  update public.view_as_sessions set ended_at = now(), end_reason = 'replaced'
  where admin_user_id = me.id and ended_at is null;

  insert into public.view_as_sessions (tenant_id, admin_user_id, admin_email, target_user_id, target_email, reason, claim_hash)
  values (who.tenant_id, me.id, lower(me.email), who.id, lower(who.email), left(btrim(coalesce(p_reason, '')), 300),
          encode(sha256(convert_to(code, 'UTF8')), 'hex'))
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'claim', code, 'email', lower(who.email));
end;
$$;
revoke all on function public.rr_view_as_request(uuid, text) from public, anon;
grant execute on function public.rr_view_as_request(uuid, text) to authenticated;

------------------------------------------------------------
-- 2. Edge Function only (service role): is this request the caller's, fresh
--    and not yet issued? Marks it issued and returns the target email.
------------------------------------------------------------
create or replace function public.rr_view_as_issue(p_id uuid, p_admin_email text)
returns text
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  r public.view_as_sessions%rowtype;
  still_admin boolean;
begin
  perform public.rr_view_as_expire();
  select * into r from public.view_as_sessions where id = p_id for update;
  if not found or r.admin_email <> lower(btrim(coalesce(p_admin_email, ''))) then
    raise exception 'View as request not found';
  end if;
  if r.ended_at is not null or r.issued_at is not null or r.requested_at < now() - interval '2 minutes' then
    raise exception 'That View as request has expired. Start again.';
  end if;
  select exists (
    select 1 from public.app_users
    where id = r.admin_user_id and active and role = 'admin'
  ) into still_admin;
  if not still_admin then
    raise exception 'Only an admin can view as another user';
  end if;
  if not exists (select 1 from public.app_users where id = r.target_user_id and active and role <> 'admin') then
    raise exception 'Team member not found or switched off';
  end if;
  update public.view_as_sessions set issued_at = now() where id = r.id;
  return r.target_email;
end;
$$;
revoke all on function public.rr_view_as_issue(uuid, text) from public, anon, authenticated;
grant execute on function public.rr_view_as_issue(uuid, text) to service_role;

------------------------------------------------------------
-- 3. Signed in as the user: tie the request to this exact sign in session.
------------------------------------------------------------
create or replace function public.rr_view_as_claim(p_id uuid, p_claim text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  r public.view_as_sessions%rowtype;
  sid text := public.rr_jwt_claim('session_id');
begin
  perform public.rr_view_as_expire();
  select * into r from public.view_as_sessions where id = p_id for update;
  if not found
     or r.claim_hash <> encode(sha256(convert_to(coalesce(p_claim, ''), 'UTF8')), 'hex')
     or r.target_user_id is distinct from public.rr_current_user_id()
     or r.issued_at is null or r.claimed_at is not null or r.ended_at is not null
     or sid is null then
    raise exception 'This View as link is not valid';
  end if;
  update public.view_as_sessions
  set claimed_at = now(), auth_session_id = sid, claim_hash = ''
  where id = r.id;
  return jsonb_build_object('id', r.id, 'expires_at', r.expires_at);
end;
$$;
revoke all on function public.rr_view_as_claim(uuid, text) from public, anon;
grant execute on function public.rr_view_as_claim(uuid, text) to authenticated;

------------------------------------------------------------
-- 4. Is this sign in session a View as session? (banner and two step)
------------------------------------------------------------
create or replace function public.rr_view_as_active()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  r public.view_as_sessions%rowtype;
  sid text := public.rr_jwt_claim('session_id');
  admin_name text;
begin
  perform public.rr_view_as_expire();
  if sid is null then
    return null;
  end if;
  select * into r from public.view_as_sessions
  where auth_session_id = sid and ended_at is null and expires_at > now()
    and target_user_id = public.rr_current_user_id()
  limit 1;
  if not found then
    return null;
  end if;
  select coalesce(nullif(btrim(name), ''), email) into admin_name from public.app_users where id = r.admin_user_id;
  return jsonb_build_object(
    'id', r.id, 'admin', coalesce(admin_name, r.admin_email), 'target_email', r.target_email,
    'expires_at', r.expires_at
  );
end;
$$;
revoke all on function public.rr_view_as_active() from public, anon;
grant execute on function public.rr_view_as_active() to authenticated;

------------------------------------------------------------
-- 5. End it: from the View as session itself, or by the admin who started it.
------------------------------------------------------------
create or replace function public.rr_view_as_end(p_id uuid default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  r public.view_as_sessions%rowtype;
  sid text := public.rr_jwt_claim('session_id');
  me uuid := public.rr_current_user_id();
begin
  if p_id is null then
    select * into r from public.view_as_sessions
    where auth_session_id = sid and ended_at is null and target_user_id = me
    limit 1;
  else
    select * into r from public.view_as_sessions
    where id = p_id and ended_at is null
      and ((auth_session_id = sid and target_user_id = me) or (admin_user_id = me and public.rr_is_admin()));
  end if;
  if not found then
    return false;
  end if;
  update public.view_as_sessions set ended_at = now(), end_reason = 'stopped' where id = r.id;
  if r.auth_session_id is not null and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where id::text = $1' using r.auth_session_id;
  end if;
  return true;
end;
$$;
revoke all on function public.rr_view_as_end(uuid) from public, anon;
grant execute on function public.rr_view_as_end(uuid) to authenticated;

------------------------------------------------------------
-- RLS: admins of the same company read the history; only the functions write.
------------------------------------------------------------
alter table public.view_as_sessions enable row level security;
revoke all on public.view_as_sessions from anon;
revoke insert, update, delete on public.view_as_sessions from authenticated;
grant select on public.view_as_sessions to authenticated;

do $$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'view_as_sessions' loop
    execute format('drop policy if exists %I on public.view_as_sessions', p.policyname);
  end loop;
end $$;

create policy "Tenant isolation" on public.view_as_sessions as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id));
create policy "Admins read view as history" on public.view_as_sessions
  for select to authenticated using (public.rr_is_admin());

-- The AI connector (MCP) never reads or writes it.
do $$
begin
  if to_regprocedure('public.rr_mcp_key_id()') is null then
    return;
  end if;
  execute 'drop policy if exists "AI never reads logs" on public.view_as_sessions';
  execute 'create policy "AI never reads logs" on public.view_as_sessions as restrictive for all to authenticated
             using (public.rr_mcp_key_id() is null) with check (public.rr_mcp_key_id() is null)';
  execute 'drop policy if exists "MCP never deletes" on public.view_as_sessions';
  execute 'create policy "MCP never deletes" on public.view_as_sessions as restrictive for delete to authenticated
             using (public.rr_mcp_key_id() is null)';
end $$;

-- The claim hash column is never shown, even to admins.
revoke select on public.view_as_sessions from authenticated;
grant select (id, tenant_id, admin_user_id, admin_email, target_user_id, target_email, reason,
  requested_at, issued_at, claimed_at, expires_at, ended_at, end_reason) on public.view_as_sessions to authenticated;

notify pgrst, 'reload schema';
