-- M6 leave requests: create, decide, role + tenant checks.
begin;
\ir _fixtures.sql

insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values (
  'e3000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'LV-1',
  'Leave Tester',
  'active'
)
on conflict do nothing;

insert into public.hr_leave_requests (
  id, tenant_id, employee_id, leave_type, starts_on, ends_on, days, status, reason
) values (
  'e3100000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'annual',
  current_date,
  current_date + 2,
  3,
  'pending',
  'Trip'
);

select pg_temp.login('manager');
select pg_temp.expect(
  (select status from public.rr_hr_leave_decide('e3100000-0000-4000-8000-000000000001', 'approve', 'ok')) = 'approved',
  'manager can approve leave');
reset role;

insert into public.hr_leave_requests (
  id, tenant_id, employee_id, leave_type, starts_on, ends_on, days, status
) values (
  'e3100000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'sick',
  current_date,
  current_date,
  1,
  'pending'
);

select pg_temp.login('sales');
select pg_temp.expect(
  (select count(*) from public.hr_leave_requests) = 0,
  'sales cannot read leave requests');
select pg_temp.expect(
  pg_temp.fails($q$select public.rr_hr_leave_decide('e3100000-0000-4000-8000-000000000002', 'approve', '')$q$),
  'sales cannot approve leave');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.hr_leave_requests where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A leave');
reset role;

rollback;
