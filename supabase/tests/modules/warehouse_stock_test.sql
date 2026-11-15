begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.warehouse_stock (id, tenant_id, warehouse_id, sku, qty_on_hand)
select
  'e8200000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  id,
  'SKU-WH-1',
  12
from public.warehouses
where code = 'MAIN'
limit 1;

select pg_temp.expect(
  (select qty_on_hand from public.warehouse_stock where sku = 'SKU-WH-1') = 12,
  'admin can set warehouse stock');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.warehouse_stock where sku = 'SKU-WH-1') = 0,
  'tenant B cannot see tenant A warehouse stock');
reset role;

rollback;
