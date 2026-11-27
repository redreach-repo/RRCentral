-- Sales safeguards (20261333090000_sales_safeguards.sql): export log and daily
-- cap, sign in history, the leaver button. One access check per role.
begin;
\ir _fixtures.sql

delete from public.user_permissions
where user_id = (select id from public.app_users where email = 'mt-sales@redreach.ae');

insert into auth.users values ('00000000-0000-0000-0000-0000000001a8', 'mt-leaver@redreach.ae', now())
on conflict (id) do nothing;
insert into public.app_users (email, name, role, active, tenant_id)
values ('mt-leaver@redreach.ae', 'MT Leaver', 'sales', true, 'a0000000-0000-4000-8000-000000000001')
on conflict (email) do update set role = 'sales', active = true;

insert into public.accounts (id, type, name, owner_user_id) values
  ('6a000000-0000-4000-8000-000000000001', 'ai_crm_client', 'Leaver Account LLC',
     (select id from public.app_users where email = 'mt-leaver@redreach.ae'));
insert into public.crm (id, company_name, owner, created_by) values
  ('6b000000-0000-4000-8000-000000000001', 'Leaver Lead Co', 'MT Leaver', 'mt-manager@redreach.ae'),
  ('6b000000-0000-4000-8000-000000000002', 'Leaver Email Lead', 'mt-leaver@redreach.ae', 'mt-manager@redreach.ae');
insert into public.user_permissions (user_id, permission)
select id, 'export.csv' from public.app_users where email = 'mt-leaver@redreach.ae';

------------------------------------------------------------
-- 1. Export log and cap
------------------------------------------------------------
select pg_temp.login('sales');
select pg_temp.expect(
  (public.rr_log_export('clients.csv', 5) ->> 'reason') = 'switched_off',
  'sales without the CSV switch is refused');
select pg_temp.expect(
  pg_temp.fails($$insert into public.export_log (filename) values ('fake.csv')$$),
  'nobody writes the export log directly');
select pg_temp.expect((select count(*) from public.export_log) = 0, 'sales cannot read the export log');
reset role;

insert into public.user_permissions (user_id, permission)
select id, 'export.csv' from public.app_users where email = 'mt-sales@redreach.ae';
insert into public.app_settings (key, value) values ('salesExportDailyCap', '3')
on conflict (key) do update set value = '3';

select pg_temp.login('sales');
select pg_temp.expect((public.rr_log_export('a.csv', 1) ->> 'allowed')::boolean, 'sales with the switch: export 1 allowed');
select pg_temp.expect((public.rr_log_export('b.csv', 1) ->> 'allowed')::boolean, 'export 2 allowed');
select pg_temp.expect((public.rr_log_export('c.csv', 1) ->> 'allowed')::boolean, 'export 3 allowed');
select pg_temp.expect((public.rr_log_export('d.csv', 1) ->> 'reason') = 'daily_cap', 'export 4 stopped by the daily cap');
reset role;

select pg_temp.login('manager');
select pg_temp.expect((public.rr_log_export('m.csv', 1) ->> 'allowed')::boolean, 'manager exports with no cap');
select pg_temp.expect(
  (select count(*) from public.export_log where user_email = 'mt-sales@redreach.ae') = 5,
  'manager reads every Sales export, refused ones too');
select pg_temp.expect(
  (select count(*) from public.export_log where user_email = 'mt-sales@redreach.ae' and not allowed) = 2,
  'refused exports are marked');
reset role;

select pg_temp.login('staff');
select pg_temp.expect((public.rr_log_export('s.csv', 1) ->> 'allowed')::boolean, 'staff exports (unchanged)');
select pg_temp.expect((select count(*) from public.export_log) = 0, 'staff cannot read the export log');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect(not (public.rr_log_export('x.csv', 1) ->> 'allowed')::boolean, 'a non-member cannot export');
reset role;

------------------------------------------------------------
-- 2. Sign in history
------------------------------------------------------------
select pg_temp.login('sales');
select public.rr_record_sign_in('Test browser', true);
select public.rr_record_sign_in('Test browser', true);
select pg_temp.expect((select count(*) from public.sign_in_log) = 0, 'sales cannot read sign ins');
select pg_temp.expect(
  pg_temp.fails($$insert into public.sign_in_log (user_email) values ('fake@x.com')$$),
  'nobody writes sign ins directly');
reset role;

select pg_temp.login('manager');
select public.rr_record_sign_in('Manager browser', false);
select pg_temp.expect((select count(*) from public.sign_in_log) = 0, 'managers do not read sign ins');
reset role;

select pg_temp.login('admin');
select pg_temp.expect(
  (select count(*) from public.sign_in_log where user_email = 'mt-sales@redreach.ae') = 1,
  'admin reads sign ins; a reload within a minute is not a second sign in');
select pg_temp.expect(
  (select two_step from public.sign_in_log where user_email = 'mt-sales@redreach.ae'),
  'sign in records two step');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.sign_in_log) = 0, 'another tenant sees no sign ins');
select pg_temp.expect((select count(*) from public.export_log) = 0, 'another tenant sees no exports');
reset role;

------------------------------------------------------------
-- 3. Leaver button
------------------------------------------------------------
select pg_temp.login('manager');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_offboard_user(
    (select id from public.app_users where email = 'mt-leaver@redreach.ae'),
    (select id from public.app_users where email = 'mt-manager@redreach.ae'))$$),
  'a manager cannot use the leaver button');
reset role;

select pg_temp.login('sales');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_offboard_user(
    (select id from public.app_users where email = 'mt-leaver@redreach.ae'),
    (select id from public.app_users where email = 'mt-sales@redreach.ae'))$$),
  'sales cannot use the leaver button');
reset role;

select pg_temp.login('admin');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_offboard_user(
    (select id from public.app_users where email = 'mt-admin@redreach.ae'),
    (select id from public.app_users where email = 'mt-manager@redreach.ae'))$$),
  'an admin cannot use it on themselves');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_offboard_user(
    (select id from public.app_users where email = 'mt-leaver@redreach.ae'),
    (select id from public.app_users where email = 'mt-leaver@redreach.ae'))$$),
  'clients cannot be handed to the leaver');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_offboard_user(
    (select id from public.app_users where email = 'mt-leaver@redreach.ae'),
    (select id from public.app_users where email = 'mt-admin@demo-b.test'))$$),
  'clients cannot be handed to another company');
select pg_temp.expect(
  (public.rr_offboard_user(
    (select id from public.app_users where email = 'mt-leaver@redreach.ae'),
    (select id from public.app_users where email = 'mt-sales@redreach.ae')) ->> 'leads')::int = 2,
  'admin hands both leads (by name and by email) to MT Sales');
reset role;

select pg_temp.expect(
  not (select active from public.app_users where email = 'mt-leaver@redreach.ae'),
  'the leaver is switched off');
select pg_temp.expect(
  (select owner_user_id from public.accounts where id = '6a000000-0000-4000-8000-000000000001')
    = (select id from public.app_users where email = 'mt-sales@redreach.ae'),
  'the leaver''s account now belongs to MT Sales');
select pg_temp.expect(
  (select count(*) from public.crm where id::text like '6b000000%' and owner = 'MT Sales') = 2,
  'the leaver''s leads now belong to MT Sales');
select pg_temp.expect(
  not exists (select 1 from public.user_permissions up join public.app_users u on u.id = up.user_id
              where u.email = 'mt-leaver@redreach.ae'),
  'the leaver''s switches are gone');

select pg_temp.login('sales');
select pg_temp.expect(
  exists (select 1 from public.accounts where id = '6a000000-0000-4000-8000-000000000001'),
  'MT Sales now sees the handed over account');
reset role;

select pg_temp.login('viewer');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_offboard_user(
    (select id from public.app_users where email = 'mt-sales@redreach.ae'),
    (select id from public.app_users where email = 'mt-manager@redreach.ae'))$$),
  'viewer cannot use the leaver button');
reset role;

rollback;
