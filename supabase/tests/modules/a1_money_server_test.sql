-- HighMast A1: exact money in SQL, payroll maths and ledger posting server side.
begin;
\ir _fixtures.sql

-- Currency rounding (accept: AED, JPY, KWD style)
select pg_temp.expect(public.rr_money_round(1.005, 'AED') = 1.01, 'AED rounds half away from zero');
select pg_temp.expect(public.rr_money_round(1234.5, 'JPY') = 1235, 'JPY has no decimals');
select pg_temp.expect(public.rr_money_round(12.3455, 'KWD') = 12.346, 'KWD has three decimals');
select pg_temp.expect(public.rr_payroll_net(18500.5, 2500, 0, 'AED') = 21000.50, 'net = basic + allowances - deductions');
select pg_temp.expect(public.rr_payroll_net(100, 0, 250, 'AED') = 0, 'net never negative');

-- Employees in tenant A (salary plain; encryption key not set in this test)
insert into public.hr_employees (id, employee_code, full_name, basic_salary_aed, allowances_aed, start_date, iban, labour_card_no, bank_routing_code)
values
  ('f1000000-0000-4000-8000-000000000001', 'P-1', 'Pay One', 18500.50, 2500, current_date - 1100, 'AE070331234567890123456', '1234', '0330'),
  ('f1000000-0000-4000-8000-000000000002', 'P-2', 'Pay Two', 9200, 1200, current_date - 400, '', '', ''),
  ('f1000000-0000-4000-8000-000000000003', 'P-3', 'Pay Three', 4100, 600, current_date - 2600, 'AE070331234567890123999', '99', '0330');
insert into public.payroll_runs (id, period_yyyy_mm, currency) values
  ('f2000000-0000-4000-8000-000000000001', '2099-01', 'AED'),
  ('f2000000-0000-4000-8000-000000000002', '2099-02', 'KWD'),
  ('f2000000-0000-4000-8000-000000000003', '2099-03', 'JPY');

-- Roles: sales/staff cannot run payroll maths; other tenant cannot either
select pg_temp.login('sales');
select pg_temp.expect(pg_temp.fails($q$select public.rr_payroll_generate_lines('f2000000-0000-4000-8000-000000000001')$q$), 'sales cannot generate payroll');
select pg_temp.login('b_admin');
select pg_temp.expect(pg_temp.fails($q$select public.rr_payroll_generate_lines('f2000000-0000-4000-8000-000000000001')$q$), 'other tenant cannot generate payroll');
select pg_temp.expect((select count(*) from public.rr_payroll_run_totals('f2000000-0000-4000-8000-000000000001')) = 0, 'other tenant sees no totals');

select pg_temp.login('manager');
select pg_temp.expect(public.rr_payroll_generate_lines('f2000000-0000-4000-8000-000000000001') = 3, 'manager generates 3 lines server side');
select pg_temp.expect(
  (select total_net = 21000.50 + 10400 + 4700 and line_count = 3 from public.rr_payroll_run_totals('f2000000-0000-4000-8000-000000000001')),
  'AED run total exact (regression: same as browser maths)');
select pg_temp.expect(
  (select gratuity_accrual_aed = round(3 * 21 * round(18500.50 / 30, 2), 2) from public.payroll_lines
   where run_id = 'f2000000-0000-4000-8000-000000000001' and employee_id = 'f1000000-0000-4000-8000-000000000001'),
  'gratuity draft computed in the database');
select pg_temp.expect(
  (select wps_ready from public.payroll_lines where run_id = 'f2000000-0000-4000-8000-000000000001' and employee_id = 'f1000000-0000-4000-8000-000000000001')
  and not (select wps_ready from public.payroll_lines where run_id = 'f2000000-0000-4000-8000-000000000001' and employee_id = 'f1000000-0000-4000-8000-000000000002'),
  'WPS readiness computed server side');
select pg_temp.expect(
  (select net_aed = 21000.50 - 125.55 from public.rr_payroll_update_line(
     (select id from public.payroll_lines where run_id = 'f2000000-0000-4000-8000-000000000001' and employee_id = 'f1000000-0000-4000-8000-000000000001'),
     null, null, 125.55)),
  'update line recomputes net in the database');

-- A browser write with a wrong net is corrected by the database
reset role;
update public.payroll_lines set net_aed = 999999 where employee_id = 'f1000000-0000-4000-8000-000000000002' and run_id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.expect((select net_aed from public.payroll_lines where employee_id = 'f1000000-0000-4000-8000-000000000002' and run_id = 'f2000000-0000-4000-8000-000000000001') = 10400, 'stored net cannot disagree with its parts');

-- KWD and JPY runs (accept: exact totals per currency)
select pg_temp.login('admin');
select public.rr_payroll_generate_lines('f2000000-0000-4000-8000-000000000002');
select public.rr_payroll_update_line(id, 1000.1235, 0.0004, 0.0005) from public.payroll_lines where run_id = 'f2000000-0000-4000-8000-000000000002';
select pg_temp.expect(
  (select total_net = 3 * 1000.123 and total_basic = 3000.372 and total_deductions = 0.003 from public.rr_payroll_run_totals('f2000000-0000-4000-8000-000000000002')),
  'KWD run total exact to 3 decimals');
select public.rr_payroll_generate_lines('f2000000-0000-4000-8000-000000000003');
select pg_temp.expect(
  (select total_net = 21001 + 10400 + 4700 from public.rr_payroll_run_totals('f2000000-0000-4000-8000-000000000003')),
  'JPY run total exact to whole yen');

-- Only draft runs can be recalculated
reset role;
update public.payroll_runs set status = 'approved' where id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.login('admin');
select pg_temp.expect(pg_temp.fails($q$select public.rr_payroll_generate_lines('f2000000-0000-4000-8000-000000000001')$q$), 'approved run cannot be regenerated');

-- Ledger: posting only through rr_gl_post_journal
reset role;
insert into public.gl_accounts (id, tenant_id, code, name, account_type) values
  ('f3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'A1-1', 'A1 cash', 'asset'),
  ('f3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'A1-2', 'A1 revenue', 'revenue');
insert into public.gl_journals (id, tenant_id, journal_number, memo, status) values
  ('f4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'J-A1-1', 'a1', 'draft');
insert into public.gl_journal_lines (tenant_id, journal_id, account_id, line_no, debit, credit) values
  ('a0000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 1, 0.1, 0),
  ('a0000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 2, 0.2, 0),
  ('a0000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 3, 0, 0.3);
select pg_temp.login('admin');
select pg_temp.expect(pg_temp.fails($q$update public.gl_journals set status = 'posted' where id = 'f4000000-0000-4000-8000-000000000001'$q$), 'browser cannot mark a journal posted directly');
select pg_temp.expect(pg_temp.fails($q$insert into public.gl_journals (tenant_id, journal_number, memo, status) values ('a0000000-0000-4000-8000-000000000001', 'J-A1-X', 'x', 'posted')$q$), 'browser cannot insert a posted journal');
select pg_temp.expect((select status from public.rr_gl_post_journal('f4000000-0000-4000-8000-000000000001')) = 'posted', '0.1 + 0.2 = 0.3 balances exactly and posts via the database');
select pg_temp.expect(coalesce(current_setting('rr.gl_posting', true), '') <> 'on', 'posting flag is cleared after posting');
reset role;

rollback;
