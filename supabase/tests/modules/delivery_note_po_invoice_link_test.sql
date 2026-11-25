-- Delivery notes point at the client PO and the invoice
-- (20261330100000_delivery_note_po_invoice_link.sql). One access check per role.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name, tenant_id)
values ('ea100000-0000-4000-8000-000000000001', 'DN Chain Client LLC', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.client_purchase_orders (id, tenant_id, client_id, po_number, amount)
values ('ea100000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001',
        'ea100000-0000-4000-8000-000000000001', 'DN-PO-1', 1000);
-- A PO in tenant B, which tenant A must not be able to point at.
insert into public.clients (id, company_name, tenant_id)
values ('ea100000-0000-4000-8000-000000000002', 'Tenant B Client', 'b0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.client_purchase_orders (id, tenant_id, client_id, po_number, amount)
values ('ea100000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-000000000001',
        'ea100000-0000-4000-8000-000000000002', 'B-PO-1', 10);

-- Re-running the migration keeps working.
\ir ../../migrations/20261330100000_delivery_note_po_invoice_link.sql
set client_min_messages = notice;

-- sales: a delivery note against the PO, later invoiced
select pg_temp.login('sales');
insert into public.delivery_notes (id, client, reference_number, quote_ref, client_po_id)
values ('ea100000-0000-4000-8000-0000000000d1', 'DN Chain Client LLC', 'DN-01-26001', 'RR-01-26200',
        'ea100000-0000-4000-8000-0000000000a1');
update public.delivery_notes set invoice_ref = '  RR-01-26200 ' where id = 'ea100000-0000-4000-8000-0000000000d1';
select pg_temp.expect(
  (select client_po_id = 'ea100000-0000-4000-8000-0000000000a1' and invoice_ref = 'RR-01-26200'
     from public.delivery_notes where id = 'ea100000-0000-4000-8000-0000000000d1'),
  'sales links a delivery note to the PO and the invoice');
select pg_temp.expect(
  pg_temp.fails($$update public.delivery_notes set client_po_id = 'ea100000-0000-4000-8000-0000000000b1'
                  where id = 'ea100000-0000-4000-8000-0000000000d1'$$),
  'cannot point at another company''s PO');
select pg_temp.expect(
  pg_temp.fails($$update public.delivery_notes set client_po_id = 'ea100000-0000-4000-8000-0000000000ff'
                  where id = 'ea100000-0000-4000-8000-0000000000d1'$$),
  'cannot point at a PO that does not exist');
reset role;

-- manager and admin can change the link
select pg_temp.login('manager');
update public.delivery_notes set invoice_ref = 'RR-01-26201' where id = 'ea100000-0000-4000-8000-0000000000d1';
select pg_temp.expect(
  (select invoice_ref = 'RR-01-26201' from public.delivery_notes where id = 'ea100000-0000-4000-8000-0000000000d1'),
  'manager can change the invoice link');
reset role;
select pg_temp.login('admin');
update public.delivery_notes set client_po_id = null where id = 'ea100000-0000-4000-8000-0000000000d1';
update public.delivery_notes set client_po_id = 'ea100000-0000-4000-8000-0000000000a1' where id = 'ea100000-0000-4000-8000-0000000000d1';
select pg_temp.expect(
  (select client_po_id is not null from public.delivery_notes where id = 'ea100000-0000-4000-8000-0000000000d1'),
  'admin can unlink and relink the PO');
reset role;

-- viewer reads the link but cannot change it
select pg_temp.login('viewer');
select pg_temp.expect(
  (select count(*) = 1 from public.delivery_notes where client_po_id = 'ea100000-0000-4000-8000-0000000000a1'),
  'viewer sees the PO link');
update public.delivery_notes set client_po_id = null where id = 'ea100000-0000-4000-8000-0000000000d1';
reset role;
select pg_temp.expect(
  (select client_po_id is not null from public.delivery_notes where id = 'ea100000-0000-4000-8000-0000000000d1'),
  'viewer cannot change the link');

-- staff role, stranger and tenant B see nothing
select pg_temp.login('staff');
select pg_temp.expect((select count(*) = 0 from public.delivery_notes where client_po_id is not null), 'staff role sees no linked delivery notes');
reset role;
select pg_temp.login('stranger');
select pg_temp.expect((select count(*) = 0 from public.delivery_notes where client_po_id is not null), 'stranger sees nothing');
reset role;
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) = 0 from public.delivery_notes where client_po_id is not null), 'tenant B cannot see tenant A links');
reset role;

-- deleting the PO keeps the delivery note, just unlinked
delete from public.client_purchase_orders where id = 'ea100000-0000-4000-8000-0000000000a1';
select pg_temp.expect(
  (select client_po_id is null and invoice_ref = 'RR-01-26201' from public.delivery_notes where id = 'ea100000-0000-4000-8000-0000000000d1'),
  'delivery note survives the PO being deleted');

rollback;
