begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.expenses (id, tenant_id, vendor, category, amount, status)
values (
  'e7300000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Vendor Exp',
  'Ops',
  6000,
  'Pending Approval'
);

select pg_temp.expect(
  (select status from public.expenses where id = 'e7300000-0000-4000-8000-000000000001')
    = 'Pending Approval',
  'expense can be Pending Approval');

update public.expenses set status = 'Recorded' where id = 'e7300000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select status from public.expenses where id = 'e7300000-0000-4000-8000-000000000001') = 'Recorded',
  'expense can move to Recorded');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.expenses where id = 'e7300000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A expense');
reset role;

rollback;
