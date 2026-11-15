begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.construction_sites (id, tenant_id, code, name, status)
values (
  'e7600000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'S1',
  'Tower A',
  'active'
);

insert into public.site_workforce_assignments (id, tenant_id, site_id, role_label)
values (
  'e7700000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'e7600000-0000-4000-8000-000000000001',
  'Foreman'
);

select pg_temp.expect(
  (select count(*) from public.construction_sites where code = 'S1') = 1,
  'admin can create construction site');
select pg_temp.expect(
  (select role_label from public.site_workforce_assignments where id = 'e7700000-0000-4000-8000-000000000001')
    = 'Foreman',
  'admin can assign workforce');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.construction_sites where id = 'e7600000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A site');
reset role;

rollback;
