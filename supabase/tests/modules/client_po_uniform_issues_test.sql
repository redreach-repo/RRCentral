-- Uniforms issued against a client PO line. One access check per role.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name, tenant_id)
values ('e8800000-0000-4000-8000-000000000001', 'PO Uniform Client LLC', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.client_purchase_orders (id, tenant_id, client_id, po_number, amount, line_items)
values ('e8800000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001',
  'e8800000-0000-4000-8000-000000000001', 'UNI-1', 2700,
  '[{"id":"cov","description":"Coverall","quantity":60,"unit":"pcs","unit_price":45,"amount":2700,"staff_group":"All staff"}]');

insert into public.client_uniform_staff (id, tenant_id, client_id, full_name, employee_code, shirt_size)
values ('e8800000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-000000000001',
  'e8800000-0000-4000-8000-000000000001', 'Ravi Kumar', 'E-1', 'L');

-- Re-running the migration keeps working.
\ir ../../migrations/20261327090000_client_po_uniform_issues.sql

-- sales: issue 2 coveralls against the PO line
select pg_temp.login('sales');
insert into public.client_uniform_issues (staff_id, item, size, quantity, issued_on, po_id, po_line_id)
values ('e8800000-0000-4000-8000-0000000000c1', 'Coverall', 'L', 2, '2026-11-21',
  'e8800000-0000-4000-8000-0000000000a1', 'cov');
select pg_temp.expect(
  (select sum(quantity) from public.client_uniform_issues
    where po_id = 'e8800000-0000-4000-8000-0000000000a1' and po_line_id = 'cov') = 2,
  'sales can issue uniforms against a PO line');
reset role;

-- manager and admin read it
select pg_temp.login('manager');
select pg_temp.expect(
  (select count(*) from public.client_uniform_issues where po_id is not null) = 1, 'manager sees PO issues');
reset role;
select pg_temp.login('admin');
select pg_temp.expect(
  (select count(*) from public.client_uniform_issues where po_id is not null) = 1, 'admin sees PO issues');
reset role;

-- viewer: read only
select pg_temp.login('viewer');
select pg_temp.expect(
  (select count(*) from public.client_uniform_issues where po_id is not null) = 1, 'viewer sees PO issues');
select pg_temp.expect(
  pg_temp.fails($$insert into public.client_uniform_issues (staff_id, item, quantity, po_id, po_line_id)
    values ('e8800000-0000-4000-8000-0000000000c1', 'Coverall', 1, 'e8800000-0000-4000-8000-0000000000a1', 'cov')$$),
  'viewer cannot issue against a PO');
reset role;

-- staff role and strangers: nothing
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 0, 'staff role cannot read PO issues');
reset role;
select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 0, 'stranger sees no PO issues');
reset role;

-- another tenant sees nothing
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 0, 'tenant B cannot see tenant A PO issues');
reset role;

-- no PO means no PO line
insert into public.client_uniform_issues (staff_id, item, quantity, po_line_id)
values ('e8800000-0000-4000-8000-0000000000c1', 'Cap', 1, 'cov');
select pg_temp.expect(
  (select po_line_id from public.client_uniform_issues where item = 'Cap') is null,
  'a line id without a PO is dropped');

-- deleting the PO keeps the issue history, just unlinked
delete from public.client_purchase_orders where id = 'e8800000-0000-4000-8000-0000000000a1';
select pg_temp.expect(
  (select count(*) from public.client_uniform_issues where item = 'Coverall' and po_id is null) = 1,
  'issue log survives the PO being deleted');

rollback;
