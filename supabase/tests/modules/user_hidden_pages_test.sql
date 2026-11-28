-- Pick the pages each person sees (20261336090000_user_hidden_pages.sql).
-- One access check per role.
begin;
\ir _fixtures.sql

delete from public.user_hidden_pages;

------------------------------------------------------------
-- Admin picks pages for a Sales user and a staff user
------------------------------------------------------------
select pg_temp.login('admin');
insert into public.user_hidden_pages (user_id, page_path)
select id, '/quotations' from public.app_users where email = 'mt-sales@redreach.ae';
insert into public.user_hidden_pages (user_id, page_path)
select id, '/hr/people' from public.app_users where email = 'mt-staff@redreach.ae';
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 2, 'admin hides pages and reads them back');
select pg_temp.expect(
  (select hidden_by from public.user_hidden_pages where page_path = '/quotations') = 'mt-admin@redreach.ae',
  'who hid the page is stamped');
select pg_temp.expect(
  pg_temp.fails($$insert into public.user_hidden_pages (user_id, page_path)
    select id, '/settings' from public.app_users where email = 'mt-admin@redreach.ae'$$),
  'admins cannot hide pages from an admin');
select pg_temp.expect(
  pg_temp.fails($$insert into public.user_hidden_pages (user_id, page_path)
    select id, 'javascript:alert(1)' from public.app_users where email = 'mt-sales@redreach.ae'$$),
  'only page paths are kept');
delete from public.user_hidden_pages where page_path = '/hr/people';
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 1, 'admin shows a page again');
reset role;

select pg_temp.expect(
  (select count(*) from public.audit_log where table_name = 'user_hidden_pages') >= 3,
  'every change is in the audit log');

------------------------------------------------------------
-- Manager reads, cannot change
------------------------------------------------------------
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 1, 'manager reads hidden pages');
select pg_temp.expect(
  pg_temp.fails($$insert into public.user_hidden_pages (user_id, page_path)
    select id, '/invoices' from public.app_users where email = 'mt-sales@redreach.ae'$$),
  'manager cannot hide pages');
delete from public.user_hidden_pages;
reset role;
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 1, 'manager cannot show pages again');

------------------------------------------------------------
-- The person reads only their own, and cannot unhide
------------------------------------------------------------
select pg_temp.login('sales');
select pg_temp.expect(
  (select count(*) from public.user_hidden_pages) = 1, 'sales reads their own hidden pages');
delete from public.user_hidden_pages;
select pg_temp.expect(
  pg_temp.fails($$insert into public.user_hidden_pages (user_id, page_path)
    select id, '/invoices' from public.app_users where email = 'mt-sales@redreach.ae'$$),
  'sales cannot change their own pages');
reset role;
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 1, 'sales cannot unhide a page');

select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 0, 'staff cannot read someone else''s pages');
reset role;

select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 0, 'viewer cannot read someone else''s pages');
select pg_temp.expect(
  pg_temp.fails($$insert into public.user_hidden_pages (user_id, page_path)
    select id, '/invoices' from public.app_users where email = 'mt-viewer@redreach.ae'$$),
  'viewer cannot hide pages');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 0, 'a non-member reads nothing');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 0, 'another company''s admin reads nothing');
select pg_temp.fails($$insert into public.user_hidden_pages (user_id, page_path)
  values ((select id from public.app_users where email = 'mt-sales@redreach.ae'), '/invoices')$$);
reset role;
select pg_temp.expect((select count(*) from public.user_hidden_pages) = 1, 'another company''s admin cannot hide our pages');

rollback;
