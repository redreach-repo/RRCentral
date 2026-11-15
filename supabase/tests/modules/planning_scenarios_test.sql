begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.planning_scenarios (id, tenant_id, name, description, assumptions_json)
values (
  'e9400000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Base case',
  'Stub',
  '{"revenue_uplift_pct":0}'::jsonb
);
select pg_temp.expect(
  (select count(*) from public.planning_scenarios where name = 'Base case') = 1,
  'admin can insert planning_scenarios');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.planning_scenarios where name = 'Base case') = 0,
  'tenant B cannot see tenant A scenarios');
reset role;

rollback;
