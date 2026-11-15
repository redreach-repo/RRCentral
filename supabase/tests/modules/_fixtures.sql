-- Shared fixtures for supabase/tests/modules/*_test.sql (include with \ir _fixtures.sql).
-- One active user per role in the Red Reach tenant (A) plus an admin in a
-- second tenant (B), and helpers. Idempotent; run inside the test's transaction.
--
--   pg_temp.expect(ok, what)     raises 'MODULE TEST FAILED: what' when not ok
--   pg_temp.fails(sql)           true when the statement raises
--   pg_temp.login(role_key)      act as: 'admin' 'manager' 'sales' 'staff' 'viewer' 'stranger' 'b_admin'
--   reset role;                  back to the superuser (plain SQL, not a function)
\set ON_ERROR_STOP 1

insert into public.tenants (id, name, slug, status, is_demo)
values ('b0000000-0000-4000-8000-000000000001', 'Demo Tenant B', 'demo-b', 'active', true)
on conflict (id) do nothing;

insert into auth.users values
  ('00000000-0000-0000-0000-0000000001a1', 'mt-admin@redreach.ae', now()),
  ('00000000-0000-0000-0000-0000000001a2', 'mt-manager@redreach.ae', now()),
  ('00000000-0000-0000-0000-0000000001a3', 'mt-sales@redreach.ae', now()),
  ('00000000-0000-0000-0000-0000000001a4', 'mt-staff@redreach.ae', now()),
  ('00000000-0000-0000-0000-0000000001a5', 'mt-viewer@redreach.ae', now()),
  ('00000000-0000-0000-0000-0000000001a6', 'mt-stranger@example.com', now()),
  ('00000000-0000-0000-0000-0000000001b1', 'mt-admin@demo-b.test', now())
on conflict (id) do nothing;

insert into public.app_users (email, name, role, active, tenant_id) values
  ('mt-admin@redreach.ae', 'MT Admin', 'admin', true, 'a0000000-0000-4000-8000-000000000001'),
  ('mt-manager@redreach.ae', 'MT Manager', 'manager', true, 'a0000000-0000-4000-8000-000000000001'),
  ('mt-sales@redreach.ae', 'MT Sales', 'sales', true, 'a0000000-0000-4000-8000-000000000001'),
  ('mt-staff@redreach.ae', 'MT Staff', 'staff', true, 'a0000000-0000-4000-8000-000000000001'),
  ('mt-viewer@redreach.ae', 'MT Viewer', 'viewer', true, 'a0000000-0000-4000-8000-000000000001'),
  ('mt-admin@demo-b.test', 'MT B Admin', 'admin', true, 'b0000000-0000-4000-8000-000000000001')
on conflict (email) do update
  set role = excluded.role, active = true, tenant_id = excluded.tenant_id;

create or replace function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'MODULE TEST FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

create or replace function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

create or replace function pg_temp.login(who text) returns void language plpgsql as $$
declare
  sub text := case who
    when 'admin' then '00000000-0000-0000-0000-0000000001a1'
    when 'manager' then '00000000-0000-0000-0000-0000000001a2'
    when 'sales' then '00000000-0000-0000-0000-0000000001a3'
    when 'staff' then '00000000-0000-0000-0000-0000000001a4'
    when 'viewer' then '00000000-0000-0000-0000-0000000001a5'
    when 'stranger' then '00000000-0000-0000-0000-0000000001a6'
    when 'b_admin' then '00000000-0000-0000-0000-0000000001b1'
  end;
begin
  if sub is null then raise exception 'unknown test user %', who; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', sub, true);
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;
