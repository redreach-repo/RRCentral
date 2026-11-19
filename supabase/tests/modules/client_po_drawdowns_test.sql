-- Client PO drawdowns: invoices take quantities off PO lines. Access per role.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name)
values ('e8700000-0000-4000-8000-000000000001', 'Drawdown Buyer L.L.C.')
on conflict (id) do nothing;

insert into public.client_purchase_orders (id, tenant_id, client_id, po_number, amount, line_items)
values ('e8700000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001',
  'e8700000-0000-4000-8000-000000000001', 'DRAW-1', 9000,
  '[{"id":"drivers","description":"Uniform drivers","quantity":30,"unit":"set","unit_price":100,"amount":3000},
    {"description":"Uniform helpers","quantity":40,"unit":"set","unit_price":100,"amount":4000}]');

insert into public.invoices (id, client, reference_number, amount)
values ('e8700000-0000-4000-8000-0000000000b1', 'Drawdown Buyer L.L.C.', 'RR-01-DRAW1', 1000),
       ('e8700000-0000-4000-8000-0000000000b2', 'Drawdown Buyer L.L.C.', 'RR-01-DRAW2', 1000);

-- Re-running the migration gives old lines an id and keeps existing ids.
\ir ../../migrations/20261320170000_client_po_drawdowns.sql
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders p, jsonb_array_elements(p.line_items) l
    where p.po_number = 'DRAW-1' and coalesce(l->>'id', '') <> '') = 2,
  'every PO line has a stable id');
select pg_temp.expect(
  (select line_items->0->>'id' from public.client_purchase_orders where po_number = 'DRAW-1') = 'drivers',
  'existing line ids are kept');

-- admin, manager, sales record what each invoice took.
select pg_temp.login('admin');
insert into public.client_po_drawdowns (po_id, po_line_id, invoice_id, quantity)
values ('e8700000-0000-4000-8000-0000000000a1', 'drivers', 'e8700000-0000-4000-8000-0000000000b1', 10);
reset role;
select pg_temp.login('manager');
insert into public.client_po_drawdowns (po_id, po_line_id, invoice_id, quantity)
values ('e8700000-0000-4000-8000-0000000000a1', 'drivers', 'e8700000-0000-4000-8000-0000000000b2', 5);
reset role;
select pg_temp.login('sales');
select pg_temp.expect(
  (select sum(quantity) from public.client_po_drawdowns where po_id = 'e8700000-0000-4000-8000-0000000000a1') = 15,
  'sales reads what has been invoiced against the PO');
update public.client_po_drawdowns set quantity = 6 where invoice_id = 'e8700000-0000-4000-8000-0000000000b2';
select pg_temp.expect(
  (select quantity from public.client_po_drawdowns where invoice_id = 'e8700000-0000-4000-8000-0000000000b2') = 6,
  'sales can correct an invoice quantity');
reset role;
select pg_temp.expect(
  (select tenant_id from public.client_po_drawdowns where invoice_id = 'e8700000-0000-4000-8000-0000000000b1')
    = 'a0000000-0000-4000-8000-000000000001',
  'a drawdown takes the tenant of its PO');

-- staff, viewer, stranger, tenant B: nothing.
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.client_po_drawdowns) = 0, 'staff role cannot read drawdowns');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_po_drawdowns (po_id, po_line_id, invoice_id, quantity)
    values ('e8700000-0000-4000-8000-0000000000a1', 'drivers', 'e8700000-0000-4000-8000-0000000000b2', 1)$q$),
  'staff role cannot record drawdowns');
reset role;
select pg_temp.login('viewer');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_po_drawdowns (po_id, po_line_id, invoice_id, quantity)
    values ('e8700000-0000-4000-8000-0000000000a1', 'x', 'e8700000-0000-4000-8000-0000000000b2', 1)$q$),
  'viewer cannot record drawdowns');
reset role;
select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.client_po_drawdowns) = 0, 'stranger cannot read drawdowns');
reset role;
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.client_po_drawdowns) = 0, 'tenant B cannot see tenant A drawdowns');
reset role;

-- Rules.
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_po_drawdowns (po_id, po_line_id, invoice_id, quantity)
    values ('e8700000-0000-4000-8000-0000000000a1', 'drivers', 'e8700000-0000-4000-8000-0000000000b1', 0)$q$),
  'quantity must be more than zero');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_po_drawdowns (po_id, po_line_id, invoice_id, quantity)
    values ('e8700000-0000-4000-8000-0000000000a1', 'drivers', 'e8700000-0000-4000-8000-0000000000b1', 3)$q$),
  'one row per invoice per PO line');
delete from public.invoices where id = 'e8700000-0000-4000-8000-0000000000b1';
select pg_temp.expect(
  (select count(*) from public.client_po_drawdowns where invoice_id = 'e8700000-0000-4000-8000-0000000000b1') = 0,
  'deleting an invoice gives its quantities back to the PO');

rollback;
