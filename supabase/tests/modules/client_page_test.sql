-- Client page (20261340090000_client_short_name.sql + the client_id links of
-- 20261339090000_client_links.sql): what each role can read for one client,
-- so the page and get_client_360 show the right money. One access check per role.
begin;
\ir _fixtures.sql

-- The Sales lock applies (no "see company money" switch).
delete from public.user_permissions
where user_id = (select id from public.app_users where email = 'mt-sales@redreach.ae');

insert into public.clients (id, company_name, short_name, trn, created_by) values
  ('c3100000-0000-4000-8000-000000000001', 'Page Client Concrete L.L.C', 'Page Client', '100000000000003', 'mt-sales@redreach.ae'),
  ('c3100000-0000-4000-8000-000000000002', 'Someone Else Trading', '', '', 'mt-manager@redreach.ae');

insert into public.quotations (id, client, reference_number, quote_id, status, amount, created_by) values
  ('c3200000-0000-4000-8000-000000000001', 'Page Client Concrete', 'RR-01-26801', 'Q-PC1', 'Sent', 1000, 'mt-manager@redreach.ae'),
  ('c3200000-0000-4000-8000-000000000002', 'Someone Else Trading', 'RR-01-26802', 'Q-PC2', 'Sent', 2000, 'mt-manager@redreach.ae');
insert into public.invoices (id, client, reference_number, amount, status, created_by) values
  ('c3300000-0000-4000-8000-000000000001', 'Page Client Concrete', 'RR-01-26801', 1050, 'Sent', 'mt-manager@redreach.ae'),
  ('c3300000-0000-4000-8000-000000000002', 'Someone Else Trading', 'RR-01-26802', 2100, 'Sent', 'mt-manager@redreach.ae');
insert into public.tickets (id, subject, requester_email, client_id) values
  ('c3400000-0000-4000-8000-000000000001', 'Page client ticket', 'x@pageclient.ae', 'c3100000-0000-4000-8000-000000000001');

select pg_temp.expect(
  (select count(*) from public.quotations where client_id = 'c3100000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.invoices where client_id = 'c3100000-0000-4000-8000-000000000001') = 1,
  'the client''s quote and invoice are linked by client_id');
select pg_temp.expect(
  (select short_name from public.clients where id = 'c3100000-0000-4000-8000-000000000001') = 'Page Client',
  'clients have a short name');

-- admin: everything
select pg_temp.login('admin');
select pg_temp.expect(
  (select count(*) from public.invoices where client_id in ('c3100000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000002')) = 2,
  'admin: reads both clients'' invoices');
reset role;

-- manager: everything, and can set the short name
select pg_temp.login('manager');
select pg_temp.expect(
  (select count(*) from public.quotations where client_id = 'c3100000-0000-4000-8000-000000000002') = 1,
  'manager: reads another client''s quotes');
update public.clients set short_name = 'Page Co' where id = 'c3100000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select short_name from public.clients where id = 'c3100000-0000-4000-8000-000000000001') = 'Page Co',
  'manager: changes the short name');
reset role;

-- sales (locked): own client only, its quote and invoice; never the other one
select pg_temp.login('sales');
select pg_temp.expect(
  exists (select 1 from public.clients where id = 'c3100000-0000-4000-8000-000000000001'),
  'sales: opens their own client');
select pg_temp.expect(
  not exists (select 1 from public.clients where id = 'c3100000-0000-4000-8000-000000000002'),
  'sales: cannot open another client');
select pg_temp.expect(
  (select count(*) from public.invoices where client_id = 'c3100000-0000-4000-8000-000000000001') = 1,
  'sales: reads their own client''s invoice (totals on the page)');
select pg_temp.expect(
  (select count(*) from public.invoices where client_id = 'c3100000-0000-4000-8000-000000000002') = 0,
  'sales: no invoices of another client');
select pg_temp.expect(
  (select count(*) from public.quotations where client_id = 'c3100000-0000-4000-8000-000000000002') = 0,
  'sales: no quotes of another client');
reset role;

-- staff: no money
select pg_temp.login('staff');
select pg_temp.expect(
  (select count(*) from public.invoices where client_id = 'c3100000-0000-4000-8000-000000000001') = 0,
  'staff: sees no invoices (no money on the page)');
select pg_temp.expect(
  (select count(*) from public.quotations where client_id = 'c3100000-0000-4000-8000-000000000001') = 0,
  'staff: sees no quotes');
reset role;

-- viewer: reads, never writes
select pg_temp.login('viewer');
select pg_temp.expect(
  (select count(*) from public.invoices where client_id = 'c3100000-0000-4000-8000-000000000001') = 1,
  'viewer: reads the invoice');
update public.clients set short_name = 'Viewer edit' where id = 'c3100000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect(
  (select short_name from public.clients where id = 'c3100000-0000-4000-8000-000000000001') = 'Page Co',
  'viewer: cannot change the short name');

-- another company: nothing
select pg_temp.login('b_admin');
select pg_temp.expect(
  not exists (select 1 from public.clients where id = 'c3100000-0000-4000-8000-000000000001'),
  'tenant B admin: cannot open a tenant A client');
select pg_temp.expect(
  (select count(*) from public.invoices where client_id = 'c3100000-0000-4000-8000-000000000001') = 0,
  'tenant B admin: no tenant A invoices');
reset role;

-- stranger: nothing
select pg_temp.login('stranger');
select pg_temp.expect(
  not exists (select 1 from public.clients where id = 'c3100000-0000-4000-8000-000000000001'),
  'stranger: cannot open the client');
reset role;

rollback;
