begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.custom_dashboards (id, tenant_id, name, layout_json, active)
values (
  'e9300000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Ops stub',
  '{"widgets":[]}'::jsonb,
  true
);
select pg_temp.expect(
  (select count(*) from public.custom_dashboards where name = 'Ops stub') = 1,
  'admin can insert custom_dashboards');

select pg_temp.expect(
  (select count(*) from public.numbering_sequences
    where doc_type = 'purchase_order' and prefix = 'PO') >= 1,
  'purchase_order numbering sequence seeded');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.custom_dashboards where name = 'Ops stub') = 0,
  'tenant B cannot see tenant A dashboards');
reset role;

rollback;
