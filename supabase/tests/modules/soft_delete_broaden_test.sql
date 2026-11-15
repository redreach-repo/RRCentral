begin;
\ir _fixtures.sql

select pg_temp.login('admin');

insert into public.vendors (id, tenant_id, company_name, active)
values (
  'e7900000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Soft Delete Vendor',
  true
)
on conflict do nothing;

update public.vendors
set deleted_at = now()
where id = 'e7900000-0000-4000-8000-000000000001';

select pg_temp.expect(
  (select deleted_at is not null from public.vendors where id = 'e7900000-0000-4000-8000-000000000001'),
  'vendor deleted_at can be set');

insert into public.products (id, sku, name, active)
values (
  'e7a00000-0000-4000-8000-000000000001',
  'SKU-SOFT-1',
  'Soft product',
  true
)
on conflict do nothing;

update public.products
set deleted_at = now()
where id = 'e7a00000-0000-4000-8000-000000000001';

select pg_temp.expect(
  (select deleted_at is not null from public.products where id = 'e7a00000-0000-4000-8000-000000000001'),
  'product deleted_at can be set');
reset role;

rollback;
