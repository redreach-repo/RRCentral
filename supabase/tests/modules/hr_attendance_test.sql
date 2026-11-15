begin;
\ir _fixtures.sql

insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values (
  'e7400000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'ATT-1',
  'Attendance Tester',
  'active'
)
on conflict do nothing;

select pg_temp.login('admin');
insert into public.hr_attendance_days (id, tenant_id, employee_id, work_date, status, hours)
values (
  'e7500000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'e7400000-0000-4000-8000-000000000001',
  current_date,
  'present',
  8
);

select pg_temp.expect(
  (select status from public.hr_attendance_days where id = 'e7500000-0000-4000-8000-000000000001') = 'present',
  'admin can log attendance day');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.hr_attendance_days where id = 'e7500000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A attendance');
reset role;

rollback;
