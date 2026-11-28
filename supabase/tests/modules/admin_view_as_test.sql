-- Admin "View as user" (20261335090000_admin_view_as.sql): who may start it,
-- the one time claim, the session binding, ending it, and one access check per role.
begin;
\ir _fixtures.sql

-- Supabase keeps sign in sessions here; the stub has none, so add one for this test.
create table if not exists auth.sessions (id uuid primary key, user_id uuid not null);
insert into auth.sessions values
  ('5e550000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000001a3'),
  ('5e550000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000001a3');

create or replace function pg_temp.claims(aal text, sid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.aal', coalesce(aal, ''), true);
  perform set_config('request.jwt.claim.session_id', coalesce(sid, ''), true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

create temp table t_ids (k text primary key, id uuid, claim text);
grant all on t_ids to authenticated;

------------------------------------------------------------
-- 1. Who can start View as
------------------------------------------------------------
select pg_temp.login('admin');
select pg_temp.claims('aal1', 'admin-session');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'x')$$),
  'admin without two step done cannot start View as');
select pg_temp.claims('aal2', 'admin-session');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-admin@redreach.ae'), 'x')$$),
  'admin cannot view as themselves');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-admin@demo-b.test'), 'x')$$),
  'admin cannot view as someone in another company');
insert into t_ids
select 'sales', (r ->> 'id')::uuid, r ->> 'claim'
from (select public.rr_view_as_request((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'Check Sales screens') r) q;
select pg_temp.expect((select claim from t_ids where k = 'sales') ~ '^[0-9a-f]{64}$', 'admin with two step gets a one time claim code');
select pg_temp.expect(
  (select count(*) from public.view_as_sessions where target_email = 'mt-sales@redreach.ae' and reason = 'Check Sales screens') = 1,
  'admin reads the View as history');
select pg_temp.expect(
  pg_temp.fails($$select claim_hash from public.view_as_sessions$$),
  'even admins cannot read the claim hash');
select pg_temp.expect(
  pg_temp.fails($$update public.view_as_sessions set expires_at = now() + interval '9 hours'$$),
  'admin cannot edit the history');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_issue((select id from t_ids where k = 'sales'), 'mt-admin@redreach.ae')$$),
  'admin cannot call the Edge Function step directly');
reset role;

update public.app_users set role = 'admin' where email = 'mt-viewer@redreach.ae';
select pg_temp.login('admin');
select pg_temp.claims('aal2', 'admin-session');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-viewer@redreach.ae'), 'x')$$),
  'admin cannot view as another admin');
reset role;
update public.app_users set role = 'viewer' where email = 'mt-viewer@redreach.ae';

select pg_temp.login('manager');
select pg_temp.claims('aal2', 'manager-session');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-staff@redreach.ae'), 'x')$$),
  'manager cannot start View as');
select pg_temp.expect((select count(*) from public.view_as_sessions) = 0, 'manager cannot read the history');
reset role;

select pg_temp.login('sales');
select pg_temp.claims('aal2', 'sales-own');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-staff@redreach.ae'), 'x')$$),
  'sales cannot start View as');
select pg_temp.expect((select count(*) from public.view_as_sessions) = 0, 'sales cannot read the history');
reset role;

select pg_temp.login('staff');
select pg_temp.claims('aal2', 'staff-own');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'x')$$),
  'staff cannot start View as');
select pg_temp.expect((select count(*) from public.view_as_sessions) = 0, 'staff cannot read the history');
reset role;

select pg_temp.login('viewer');
select pg_temp.claims('aal2', 'viewer-own');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'x')$$),
  'viewer cannot start View as');
reset role;

select pg_temp.login('stranger');
select pg_temp.claims('aal2', 'stranger-own');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'x')$$),
  'a non-member cannot start View as');
reset role;

select pg_temp.login('b_admin');
select pg_temp.claims('aal2', 'b-admin');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'x')$$),
  'another company''s admin cannot view as our staff');
select pg_temp.expect((select count(*) from public.view_as_sessions) = 0, 'another company''s admin sees no history');
reset role;

------------------------------------------------------------
-- 2. The Edge Function step (service role, here the superuser)
------------------------------------------------------------
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_issue((select id from t_ids where k = 'sales'), 'mt-manager@redreach.ae')$$),
  'a request is only issued to the admin who made it');
select pg_temp.expect(
  public.rr_view_as_issue((select id from t_ids where k = 'sales'), 'MT-Admin@redreach.ae') = 'mt-sales@redreach.ae',
  'the Edge Function gets the target email for a fresh request');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_issue((select id from t_ids where k = 'sales'), 'mt-admin@redreach.ae')$$),
  'a request is issued only once');

------------------------------------------------------------
-- 3. Claiming in the new sign in session
------------------------------------------------------------
select pg_temp.login('sales');
select pg_temp.claims('aal1', '5e550000-0000-4000-8000-000000000001');
select pg_temp.expect(public.rr_view_as_active() is null, 'before the claim the session is not View as');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_claim((select id from t_ids where k = 'sales'), 'wrong')$$),
  'a wrong claim code is refused');
reset role;

select pg_temp.login('staff');
select pg_temp.claims('aal1', 'staff-session');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_claim((select id from t_ids where k = 'sales'), (select claim from t_ids where k = 'sales'))$$),
  'someone else cannot claim it, even with the code');
reset role;

select pg_temp.login('sales');
select pg_temp.claims('aal1', '5e550000-0000-4000-8000-000000000001');
select public.rr_view_as_claim((select id from t_ids where k = 'sales'), (select claim from t_ids where k = 'sales'));
select pg_temp.expect((public.rr_view_as_active() ->> 'admin') = 'MT Admin', 'the claimed session is View as, showing the admin');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_claim((select id from t_ids where k = 'sales'), (select claim from t_ids where k = 'sales'))$$),
  'the claim code works once');
reset role;

-- The real user signing in on their own (another session) is never treated as View as.
select pg_temp.login('sales');
select pg_temp.claims('aal1', '5e550000-0000-4000-8000-000000000002');
select pg_temp.expect(public.rr_view_as_active() is null, 'the user''s own sign in is not View as, so two step still applies');
select pg_temp.expect(not public.rr_view_as_end(null), 'the user''s own session cannot end the admin''s View as');
reset role;

------------------------------------------------------------
-- 4. Ending it deletes that sign in session only
------------------------------------------------------------
select pg_temp.login('sales');
select pg_temp.claims('aal1', '5e550000-0000-4000-8000-000000000001');
select pg_temp.expect(public.rr_view_as_end(null), 'Stop ends the View as session');
select pg_temp.expect(public.rr_view_as_active() is null, 'after Stop the session is not View as');
reset role;
select pg_temp.expect(
  not exists (select 1 from auth.sessions where id = '5e550000-0000-4000-8000-000000000001'),
  'Stop deletes the View as sign in session');
select pg_temp.expect(
  exists (select 1 from auth.sessions where id = '5e550000-0000-4000-8000-000000000002'),
  'the user''s own sign in session is untouched');
select pg_temp.expect(
  (select end_reason from public.view_as_sessions where id = (select id from t_ids where k = 'sales')) = 'stopped',
  'the history records how it ended');

------------------------------------------------------------
-- 5. Expiry, one at a time, and the hourly cap
------------------------------------------------------------
select pg_temp.login('admin');
select pg_temp.claims('aal2', 'admin-session');
insert into t_ids
select 'staff', (r ->> 'id')::uuid, r ->> 'claim'
from (select public.rr_view_as_request((select id from public.app_users where email = 'mt-staff@redreach.ae'), '') r) q;
insert into t_ids
select 'staff2', (r ->> 'id')::uuid, r ->> 'claim'
from (select public.rr_view_as_request((select id from public.app_users where email = 'mt-staff@redreach.ae'), '') r) q;
reset role;
select pg_temp.expect(
  (select end_reason from public.view_as_sessions where id = (select id from t_ids where k = 'staff')) = 'replaced',
  'a new View as closes the admin''s previous one');

update public.view_as_sessions set requested_at = now() - interval '5 minutes' where id = (select id from t_ids where k = 'staff2');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_issue((select id from t_ids where k = 'staff2'), 'mt-admin@redreach.ae')$$),
  'a request not used within 2 minutes cannot be issued');

update public.view_as_sessions set expires_at = now() - interval '1 second' where id = (select id from t_ids where k = 'staff2');
select pg_temp.login('admin');
select pg_temp.claims('aal2', 'admin-session');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_end((select id from t_ids where k = 'staff2'))$$) is false,
  'ending runs cleanly for the admin');
reset role;
select pg_temp.expect(
  (select ended_at is not null from public.view_as_sessions where id = (select id from t_ids where k = 'staff2')),
  'expired sessions are ended');

select pg_temp.login('admin');
select pg_temp.claims('aal2', 'admin-session');
select public.rr_view_as_request((select id from public.app_users where email = 'mt-staff@redreach.ae'), '')
from generate_series(1, 7);
select pg_temp.expect(
  pg_temp.fails($$select public.rr_view_as_request((select id from public.app_users where email = 'mt-staff@redreach.ae'), '')$$),
  'at most 10 View as sessions an hour');
reset role;

rollback;
