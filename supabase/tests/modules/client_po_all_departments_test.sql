-- Client POs for every department: a PO can point at any client from the
-- company wide clients list, with an optional department code. Access per role.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name)
values ('e8500000-0000-4000-8000-000000000001', 'Threads Uniform Buyer L.L.C.')
on conflict (id) do nothing;

-- admin, manager and sales can each record a PO against a client, no account needed.
select pg_temp.login('admin');
insert into public.client_purchase_orders (tenant_id, client_id, division_code, po_number, amount)
values ('a0000000-0000-4000-8000-000000000001', 'e8500000-0000-4000-8000-000000000001', '01', 'DEP-ADMIN', 100);
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number = 'DEP-ADMIN' and account_id is null) = 1,
  'admin can create a client PO for a client with no account');
reset role;

select pg_temp.login('manager');
insert into public.client_purchase_orders (tenant_id, client_id, division_code, po_number, amount)
values ('a0000000-0000-4000-8000-000000000001', 'e8500000-0000-4000-8000-000000000001', '06', 'DEP-MANAGER', 200);
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number = 'DEP-MANAGER') = 1,
  'manager can create a client PO for any department');
reset role;

select pg_temp.login('sales');
insert into public.client_purchase_orders (tenant_id, client_id, po_number, amount)
values ('a0000000-0000-4000-8000-000000000001', 'e8500000-0000-4000-8000-000000000001', 'DEP-SALES', 300);
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'DEP-%') = 3,
  'sales can create and read client POs for every department');
reset role;

-- staff and viewer keep the same access as before (none), stranger none.
select pg_temp.login('staff');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'DEP-%') = 0,
  'staff role cannot read client POs');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, po_number)
    values ('a0000000-0000-4000-8000-000000000001', 'e8500000-0000-4000-8000-000000000001', 'DEP-STAFF')$q$),
  'staff role cannot create client POs');
reset role;

select pg_temp.login('viewer');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, po_number)
    values ('a0000000-0000-4000-8000-000000000001', 'e8500000-0000-4000-8000-000000000001', 'DEP-VIEWER')$q$),
  'viewer cannot create client POs');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'DEP-%') = 0,
  'stranger cannot read client POs');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where po_number like 'DEP-%') = 0,
  'tenant B cannot see tenant A client POs');
reset role;

-- Rules: needs a client or an account; department code is two digits; PO unique per client.
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, po_number)
    values ('a0000000-0000-4000-8000-000000000001', 'DEP-NOBODY')$q$),
  'a client PO needs a client or an account');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, division_code, po_number)
    values ('a0000000-0000-4000-8000-000000000001', 'e8500000-0000-4000-8000-000000000001', 'sales', 'DEP-BADDIV')$q$),
  'department code must be two digits');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.client_purchase_orders (tenant_id, client_id, po_number)
    values ('a0000000-0000-4000-8000-000000000001', 'e8500000-0000-4000-8000-000000000001', 'DEP-ADMIN')$q$),
  'same PO number twice for one client is refused');

rollback;
