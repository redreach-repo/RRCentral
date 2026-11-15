begin;
\ir _fixtures.sql

select pg_temp.login('admin');
select pg_temp.expect(
  (select count(*) from public.warehouses where code = 'MAIN' and is_default) >= 1,
  'default MAIN warehouse seeded');

insert into public.warehouses (id, tenant_id, code, name, is_default)
values (
  'e7000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'DXB',
  'Dubai store',
  false
);

insert into public.purchase_orders (id, tenant_id, po_number, vendor_name, status, warehouse_id)
values (
  'e7100000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'PO-WH-1',
  'Vendor WH',
  'ordered',
  'e7000000-0000-4000-8000-000000000001'
);

select pg_temp.expect(
  (select warehouse_id from public.purchase_orders where id = 'e7100000-0000-4000-8000-000000000001')
    = 'e7000000-0000-4000-8000-000000000001',
  'PO can stamp warehouse_id');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.warehouses where id = 'e7000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A warehouse');
reset role;

rollback;
