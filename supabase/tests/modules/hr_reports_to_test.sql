begin;
\ir _fixtures.sql

insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values
  (
    'e7200000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'MGR-1',
    'Manager One',
    'active'
  ),
  (
    'e7200000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'EMP-1',
    'Report One',
    'active'
  )
on conflict do nothing;

select pg_temp.login('admin');
update public.hr_employees
set reports_to_id = 'e7200000-0000-4000-8000-000000000001'
where id = 'e7200000-0000-4000-8000-000000000002';

select pg_temp.expect(
  (select reports_to_id from public.hr_employees where id = 'e7200000-0000-4000-8000-000000000002')
    = 'e7200000-0000-4000-8000-000000000001',
  'admin can set reports_to_id');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.hr_employees where id = 'e7200000-0000-4000-8000-000000000002') = 0,
  'tenant B cannot see tenant A employee');
reset role;

rollback;
