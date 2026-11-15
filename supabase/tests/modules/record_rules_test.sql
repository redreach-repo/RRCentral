begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.record_rules (id, tenant_id, object_type, name, scope, filter_json, active)
values (
  'e9100000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'deal',
  'Owner only',
  'owner',
  '{}'::jsonb,
  true
);
select pg_temp.expect(
  (select count(*) from public.record_rules where name = 'Owner only') = 1,
  'admin can insert record_rules');
reset role;

select pg_temp.login('sales');
select pg_temp.expect(
  (select count(*) from public.record_rules where name = 'Owner only') = 1,
  'sales can read record_rules');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.record_rules where name = 'Owner only') = 0,
  'tenant B cannot see tenant A record_rules');
reset role;

rollback;
