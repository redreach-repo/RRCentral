begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.planning_goals (id, tenant_id, name, metric_key, target_value, period_yyyy_mm, status)
values (
  'e7800000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Q revenue',
  'revenue_aed',
  100000,
  '2026-11',
  'active'
);

select pg_temp.expect(
  (select target_value from public.planning_goals where id = 'e7800000-0000-4000-8000-000000000001') = 100000,
  'admin can create planning goal');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.planning_goals where id = 'e7800000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A goal');
reset role;

rollback;
