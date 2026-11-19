-- HR and payroll tables: only managers and admins of the same company.
begin;
\ir _fixtures.sql

insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values ('e4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'HP-1', 'Pay Tester', 'active')
on conflict do nothing;
insert into public.payroll_runs (id, tenant_id, period_yyyy_mm)
values ('e4100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-11')
on conflict do nothing;
insert into public.payroll_lines (id, tenant_id, run_id, employee_id)
values ('e4200000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'e4100000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.hr_attendance_days (id, tenant_id, employee_id, work_date)
values ('e4300000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'e4000000-0000-4000-8000-000000000001', current_date)
on conflict do nothing;

-- Sales, plain staff and viewers see nothing and cannot write.
do $$
declare
  who text;
begin
  foreach who in array array['sales', 'staff', 'viewer']
  loop
    perform pg_temp.login(who);
    perform pg_temp.expect((select count(*) from public.hr_employees) = 0, who || ' cannot read HR people');
    perform pg_temp.expect((select count(*) from public.payroll_runs) = 0, who || ' cannot read payroll runs');
    perform pg_temp.expect((select count(*) from public.payroll_lines) = 0, who || ' cannot read payroll lines');
    perform pg_temp.expect((select count(*) from public.hr_attendance_days) = 0, who || ' cannot read attendance');
    perform pg_temp.expect(
      pg_temp.fails($q$insert into public.hr_employees (tenant_id, employee_code, full_name, employment_status)
        values ('a0000000-0000-4000-8000-000000000001', 'HP-X', 'Sneaky', 'active')$q$),
      who || ' cannot add HR people');
    reset role;
  end loop;
end $$;

-- Managers and admins keep full access.
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.hr_employees where id = 'e4000000-0000-4000-8000-000000000001') = 1, 'manager reads HR people');
select pg_temp.expect((select count(*) from public.payroll_lines where id = 'e4200000-0000-4000-8000-000000000001') = 1, 'manager reads payroll lines');
select pg_temp.expect((select count(*) from public.hr_attendance_days where id = 'e4300000-0000-4000-8000-000000000001') = 1, 'manager reads attendance');
reset role;

select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.payroll_runs where id = 'e4100000-0000-4000-8000-000000000001') = 1, 'admin reads payroll runs');
reset role;

-- Another company's admin sees nothing.
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.hr_employees where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0, 'tenant B cannot see tenant A HR people');
select pg_temp.expect((select count(*) from public.payroll_lines where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0, 'tenant B cannot see tenant A payroll');
reset role;

rollback;
