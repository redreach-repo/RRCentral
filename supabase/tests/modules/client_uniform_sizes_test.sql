-- RR Threads: client staff uniform sizes and issue log. One access check per role.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name, tenant_id)
values ('e7000000-0000-4000-8000-000000000001', 'Uniform Client LLC', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- sales: add a person with sizes, then log an issue
select pg_temp.login('sales');
insert into public.client_uniform_staff (id, client_id, full_name, employee_code, shirt_size, trouser_size, shoe_size)
values ('e7000000-0000-4000-8000-0000000000a1', 'e7000000-0000-4000-8000-000000000001', 'Ali Hassan', 'EMP-1', 'L', '32', '42');
insert into public.client_uniform_issues (staff_id, item, size, quantity, issued_on)
values ('e7000000-0000-4000-8000-0000000000a1', 'Shirt', 'L', 2, '2026-11-01');
select pg_temp.expect((select count(*) from public.client_uniform_staff) = 1, 'sales can add client staff with sizes');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 1, 'sales can log an issued uniform');
select pg_temp.expect(
  (select tenant_id from public.client_uniform_issues limit 1) = 'a0000000-0000-4000-8000-000000000001',
  'issue row takes the tenant of the person');
update public.client_uniform_staff set shirt_size = 'XL' where id = 'e7000000-0000-4000-8000-0000000000a1';
select pg_temp.expect(
  (select shirt_size from public.client_uniform_staff where id = 'e7000000-0000-4000-8000-0000000000a1') = 'XL',
  'sales can update sizes');
delete from public.client_uniform_issues;
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 1, 'sales cannot delete issue rows');
select pg_temp.expect(
  pg_temp.fails($$insert into public.client_uniform_staff (client_id, full_name, employee_code)
    values ('e7000000-0000-4000-8000-000000000001', 'Dup', 'emp-1')$$),
  'employee number is unique per client');
select pg_temp.expect(
  pg_temp.fails($$insert into public.client_uniform_issues (staff_id, item, quantity)
    values ('e7000000-0000-4000-8000-0000000000a1', 'Cap', 0)$$),
  'quantity must be at least 1');
reset role;

-- admin and manager: read, and delete
select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.client_uniform_staff) = 1, 'admin can read client staff');
reset role;

select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 1, 'manager can read issue log');
delete from public.client_uniform_issues;
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 0, 'manager can delete issue rows');
insert into public.client_uniform_issues (staff_id, item, size, quantity)
values ('e7000000-0000-4000-8000-0000000000a1', 'Trousers', '32', 1);
reset role;

-- viewer: read only
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.client_uniform_staff) = 1, 'viewer can read client staff');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 1, 'viewer can read issue log');
select pg_temp.expect(
  pg_temp.fails($$insert into public.client_uniform_staff (client_id, full_name)
    values ('e7000000-0000-4000-8000-000000000001', 'Viewer try')$$),
  'viewer cannot add client staff');
update public.client_uniform_staff set shoe_size = '44';
reset role;
select pg_temp.expect(
  (select shoe_size from public.client_uniform_staff where id = 'e7000000-0000-4000-8000-0000000000a1') = '42',
  'viewer cannot change sizes');

-- staff role: no access (same as the clients list)
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.client_uniform_staff) = 0, 'staff role cannot read client staff');
select pg_temp.expect(
  pg_temp.fails($$insert into public.client_uniform_issues (staff_id, item)
    values ('e7000000-0000-4000-8000-0000000000a1', 'Shirt')$$),
  'staff role cannot log issues');
reset role;

-- not a team member
select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.client_uniform_staff) = 0, 'stranger sees no client staff');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 0, 'stranger sees no issue log');
reset role;

-- another tenant
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.client_uniform_staff) = 0, 'tenant B cannot see tenant A client staff');
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 0, 'tenant B cannot see tenant A issue log');
reset role;

-- deleting the person removes their issue history
delete from public.client_uniform_staff where id = 'e7000000-0000-4000-8000-0000000000a1';
select pg_temp.expect((select count(*) from public.client_uniform_issues) = 0, 'issue rows go with the person');

rollback;
