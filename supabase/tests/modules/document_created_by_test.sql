-- Who made each document (20261337090000_document_created_by.sql), for the
-- "Made by Sales" card on Home. One access check per role.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name, created_by) values
  ('7c000000-0000-4000-8000-000000000001', 'Made By Test Co', 'mt-manager@redreach.ae');

------------------------------------------------------------
-- Sales (with company money, as the fixtures set): stamped as themselves
------------------------------------------------------------
select pg_temp.login('sales');
insert into public.quotations (id, client, reference_number, quote_id, created_by) values
  ('7d000000-0000-4000-8000-000000000001', 'Made By Test Co', 'RR-01-27001', 'Q-7001', 'mt-manager@redreach.ae');
insert into public.invoices (id, client, reference_number, created_by) values
  ('7e000000-0000-4000-8000-000000000001', 'Made By Test Co', 'RR-01-27001', '');
insert into public.delivery_notes (id, client, reference_number, quote_ref, created_by) values
  ('7f000000-0000-4000-8000-000000000001', 'Made By Test Co', 'DN-01-27001', 'RR-01-27001', 'someone@else.com');
insert into public.client_purchase_orders (id, po_number, client_id) values
  ('7f100000-0000-4000-8000-000000000001', 'PO-7001', '7c000000-0000-4000-8000-000000000001');
reset role;

select pg_temp.expect(
  (select created_by from public.quotations where id = '7d000000-0000-4000-8000-000000000001') = 'mt-sales@redreach.ae',
  'a quote is stamped with the person who made it, not what the browser sent');
select pg_temp.expect(
  (select created_by from public.invoices where id = '7e000000-0000-4000-8000-000000000001') = 'mt-sales@redreach.ae',
  'an invoice is stamped with the person who made it');
select pg_temp.expect(
  (select created_by from public.delivery_notes where id = '7f000000-0000-4000-8000-000000000001') = 'mt-sales@redreach.ae',
  'a delivery note is stamped with the person who made it');
select pg_temp.expect(
  (select created_by from public.client_purchase_orders where id = '7f100000-0000-4000-8000-000000000001') = 'mt-sales@redreach.ae',
  'a client PO now records who made it');

select pg_temp.login('sales');
update public.quotations set created_by = 'mt-manager@redreach.ae', notes = 'edited'
where id = '7d000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect(
  (select created_by || '|' || notes from public.quotations where id = '7d000000-0000-4000-8000-000000000001')
    = 'mt-sales@redreach.ae|edited',
  'the maker never changes on edit, the edit itself is kept');

------------------------------------------------------------
-- Manager and admin read every document with its maker
------------------------------------------------------------
select pg_temp.login('manager');
select pg_temp.expect(
  (select count(*) from public.quotations where created_by = 'mt-sales@redreach.ae' and reference_number = 'RR-01-27001') = 1,
  'manager sees the quote Sales made');
update public.invoices set created_by = 'mt-manager@redreach.ae' where id = '7e000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect(
  (select created_by from public.invoices where id = '7e000000-0000-4000-8000-000000000001') = 'mt-sales@redreach.ae',
  'a manager cannot take over the maker either');

select pg_temp.login('admin');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where created_by = 'mt-sales@redreach.ae') >= 1,
  'admin sees the client PO Sales made');
insert into public.quotations (id, client, reference_number, quote_id, created_by) values
  ('7d000000-0000-4000-8000-000000000002', 'Made By Test Co', 'RR-01-27002', 'Q-7002', 'mt-sales@redreach.ae');
reset role;
select pg_temp.expect(
  (select created_by from public.quotations where id = '7d000000-0000-4000-8000-000000000002') = 'mt-admin@redreach.ae',
  'an admin cannot make a quote in a salesperson''s name');

------------------------------------------------------------
-- Server writes (no signed-in person) keep what they were given
------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', true);
insert into public.quotations (id, client, reference_number, quote_id, created_by) values
  ('7d000000-0000-4000-8000-000000000003', 'Made By Test Co', 'RR-01-27003', 'Q-7003', 'import@redreach.ae');
select pg_temp.expect(
  (select created_by from public.quotations where id = '7d000000-0000-4000-8000-000000000003') = 'import@redreach.ae',
  'a server import keeps its maker');

------------------------------------------------------------
-- Other roles: unchanged access
------------------------------------------------------------
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.quotations where reference_number like 'RR-01-2700%') = 0,
  'staff still sees no quotes');
reset role;

select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.quotations where reference_number like 'RR-01-2700%') = 3,
  'viewer still reads quotes (unchanged)');
select pg_temp.expect(
  pg_temp.fails($$insert into public.quotations (client, reference_number, quote_id) values ('X', 'RR-01-27009', 'Q-7009')$$),
  'viewer still cannot make a quote');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.quotations where reference_number like 'RR-01-2700%') = 0,
  'a non-member reads nothing');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.quotations where reference_number like 'RR-01-2700%') = 0,
  'another company''s admin reads nothing');
reset role;

rollback;
