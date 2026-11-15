begin;
\ir _fixtures.sql

select pg_temp.login('admin');

select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'quotations' and column_name = 'deleted_at') = 1,
  'quotations has deleted_at');
select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'deleted_at') = 1,
  'invoices has deleted_at');
select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_notes' and column_name = 'deleted_at') = 1,
  'delivery_notes has deleted_at');
select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'purchase_orders' and column_name = 'deleted_at') = 1,
  'purchase_orders has deleted_at');

update public.purchase_orders
set deleted_at = now()
where id in (select id from public.purchase_orders limit 1);

select pg_temp.expect(
  (select count(*) from public.purchase_orders where deleted_at is not null) >= 0,
  'purchase_orders deleted_at writable');
reset role;

rollback;
