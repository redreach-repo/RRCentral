-- Client PO file and details read off it: access per role and the column rules.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name)
values ('e8600000-0000-4000-8000-000000000001', 'PO Reader Buyer L.L.C.')
on conflict (id) do nothing;

-- admin, manager and sales can save a PO with its file link and details.
select pg_temp.login('admin');
insert into public.client_purchase_orders
  (tenant_id, client_id, po_number, amount, currency, file_name, file_url, drive_file_id,
   line_items, subtotal, vat_rate, vat_amount, delivery_terms, payment_terms, details_read_at)
values ('a0000000-0000-4000-8000-000000000001', 'e8600000-0000-4000-8000-000000000001', 'READ-ADMIN', 315, 'AED',
  'PO READ-ADMIN - scan.pdf', 'https://drive.google.com/file/d/abc123/view', 'abc123',
  '[{"description":"Polo","quantity":2,"unit":"pcs","unit_price":150,"amount":300}]', 300, 5, 15,
  'Within 14 days', '30 days', now());
select pg_temp.expect(
  (select line_items->0->>'description' from public.client_purchase_orders where po_number = 'READ-ADMIN') = 'Polo',
  'admin can save a client PO with its file and line items');
reset role;

select pg_temp.login('manager');
update public.client_purchase_orders set payment_terms = '45 days' where po_number = 'READ-ADMIN';
select pg_temp.expect(
  (select payment_terms from public.client_purchase_orders where po_number = 'READ-ADMIN') = '45 days',
  'manager can correct the details');
reset role;

select pg_temp.login('sales');
insert into public.client_purchase_orders (tenant_id, client_id, po_number, amount, vat_rate)
values ('a0000000-0000-4000-8000-000000000001', 'e8600000-0000-4000-8000-000000000001', 'READ-SALES', 50, 5);
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'READ-%') = 2,
  'sales can save and read client POs with details');
reset role;

-- staff, viewer, stranger and another tenant see none of it and cannot change it.
select pg_temp.login('staff');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'READ-%') = 0,
  'staff role cannot read client PO details');
update public.client_purchase_orders set file_url = '' where po_number = 'READ-ADMIN';
reset role;
select pg_temp.expect(
  (select file_url from public.client_purchase_orders where po_number = 'READ-ADMIN') <> '',
  'staff role cannot change the PO file link');

select pg_temp.login('viewer');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, po_number)
    values ('a0000000-0000-4000-8000-000000000001', 'e8600000-0000-4000-8000-000000000001', 'READ-VIEWER')$q$),
  'viewer cannot create client POs');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'READ-%') = 0,
  'stranger cannot read client PO details');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'READ-%') = 0,
  'tenant B cannot see tenant A client PO details');
reset role;

-- Column rules.
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, po_number, line_items)
    values ('a0000000-0000-4000-8000-000000000001', 'e8600000-0000-4000-8000-000000000001', 'READ-BADLINES', '{"a":1}')$q$),
  'line items must be a list');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, po_number, vat_rate)
    values ('a0000000-0000-4000-8000-000000000001', 'e8600000-0000-4000-8000-000000000001', 'READ-BADVAT', 150)$q$),
  'VAT rate must be 0 to 100');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, po_number, file_url)
    values ('a0000000-0000-4000-8000-000000000001', 'e8600000-0000-4000-8000-000000000001', 'READ-BADURL', 'https://evil.example/x')$q$),
  'the PO file link must be a Google Drive link');
select pg_temp.expect(
  (select drive_folder_url from public.clients where id = 'e8600000-0000-4000-8000-000000000001') = '',
  'clients have an empty Drive folder link until the first upload');

rollback;
