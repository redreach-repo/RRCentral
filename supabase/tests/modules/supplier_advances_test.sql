-- Supplier advances (20261331090000_supplier_advances.sql). One access check
-- per role, the PO / quote links, applying to bills, and the AI connector.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name, tenant_id)
values ('ea000000-0000-4000-8000-000000000001', 'Green Cement LLC', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.quotations (id, client, reference_number, base_reference, quote_id, date, valid_until, amount, status, division_code, tenant_id)
values
  ('ea000000-0000-4000-8000-0000000000b1', 'Green Cement LLC', 'RR-01-26200', 'RR-01-26200', 'Q-26200',
   '2026-11-10', '2026-12-10', 52500, 'Awarded', '01', 'a0000000-0000-4000-8000-000000000001'),
  ('ea000000-0000-4000-8000-0000000000b2', 'Green Cement LLC', 'RR-01-26201', 'RR-01-26201', 'Q-26201',
   '2026-11-12', '2026-12-12', 10500, 'Sent', '01', 'a0000000-0000-4000-8000-000000000001'),
  ('ea000000-0000-4000-8000-0000000000b9', 'Tenant B client', 'DB-01-00001', 'DB-01-00001', 'Q-B1',
   '2026-11-12', '2026-12-12', 100, 'Sent', '01', 'b0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.client_purchase_orders (id, tenant_id, client_id, po_number, amount, issued_on, quotation_id)
values
  ('ea000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001',
   'ea000000-0000-4000-8000-000000000001', 'GC-PO-1', 52500, '2026-11-20', 'ea000000-0000-4000-8000-0000000000b1'),
  ('ea000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-000000000001',
   'ea000000-0000-4000-8000-000000000001', 'GC-PO-2', 10500, '2026-11-21', null)
on conflict (id) do nothing;

insert into public.vendors (id, company_name, tenant_id)
values ('ea000000-0000-4000-8000-0000000000c1', 'Steel Supplier FZE', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Two bills from the vendor and one canceled bill.
insert into public.expenses (id, date, vendor, category, amount, quote_ref, status, tenant_id)
values
  ('ea000000-0000-4000-8000-0000000000e1', '2026-11-25', 'Steel Supplier FZE', 'Materials', 21000, 'RR-01-26200', 'Recorded', 'a0000000-0000-4000-8000-000000000001'),
  ('ea000000-0000-4000-8000-0000000000e2', '2026-11-26', 'Steel Supplier FZE', 'Materials', 3000, 'RR-01-26200', 'Recorded', 'a0000000-0000-4000-8000-000000000001'),
  ('ea000000-0000-4000-8000-0000000000e3', '2026-11-26', 'Steel Supplier FZE', 'Materials', 500, '', 'Canceled', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Re-running the migration keeps working.
\ir ../../migrations/20261331090000_supplier_advances.sql
set client_min_messages = notice;

------------------------------------------------------------
-- sales: record an advance, quote comes from the PO
------------------------------------------------------------
select pg_temp.login('sales');
insert into public.supplier_advances (id, vendor_id, vendor_name, client_po_id, paid_on, amount, payment_method, reference, tenant_id, created_by)
values ('ea100000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000c1', ' Steel Supplier FZE ',
        'ea000000-0000-4000-8000-0000000000a1', '2026-11-22', 20000, 'Bank transfer', 'TT-7781',
        'b0000000-0000-4000-8000-000000000001', 'forged@example.com');
select pg_temp.expect((select count(*) from public.supplier_advances) = 1, 'sales can record an advance');
select pg_temp.expect(
  (select quotation_id = 'ea000000-0000-4000-8000-0000000000b1' and quote_reference = 'RR-01-26200'
          and tenant_id = 'a0000000-0000-4000-8000-000000000001' and created_by = 'mt-sales@redreach.ae'
          and vendor_name = 'Steel Supplier FZE' and currency = 'AED'
     from public.supplier_advances where id = 'ea100000-0000-4000-8000-000000000001'),
  'quote and its number come from the PO; tenant from the PO; who from the session');

select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount)
  values ('Steel Supplier FZE', 'ea000000-0000-4000-8000-0000000000a2', 1000)$q$),
  'a PO without a linked quote needs a quotation picked');
insert into public.supplier_advances (id, vendor_name, client_po_id, quotation_id, paid_on, amount)
values ('ea100000-0000-4000-8000-000000000002', 'Fabric Mill LLC', 'ea000000-0000-4000-8000-0000000000a2',
        'ea000000-0000-4000-8000-0000000000b2', '2026-11-23', 4000);
select pg_temp.expect(
  (select quote_reference = 'RR-01-26201' from public.supplier_advances where id = 'ea100000-0000-4000-8000-000000000002'),
  'with a quotation picked it saves');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, amount, quotation_id)
  values ('Steel Supplier FZE', 1000, 'ea000000-0000-4000-8000-0000000000b1')$q$),
  'an advance needs a client PO');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount)
  values ('Steel Supplier FZE', 'ea000000-0000-4000-8000-0000000000a1', 0)$q$),
  'amount must be more than zero');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount, currency)
  values ('Steel Supplier FZE', 'ea000000-0000-4000-8000-0000000000a1', 10, 'USD')$q$),
  'AED only');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount)
  values ('  ', 'ea000000-0000-4000-8000-0000000000a1', 10)$q$),
  'a vendor name is needed');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, quotation_id, amount)
  values ('X', 'ea000000-0000-4000-8000-0000000000a2', 'ea000000-0000-4000-8000-0000000000b9', 10)$q$),
  'a quotation from another tenant is refused');

------------------------------------------------------------
-- sales: apply the advance to the vendor's bills
------------------------------------------------------------
insert into public.supplier_advance_applications (id, advance_id, expense_id, amount)
values ('ea200000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000e1', 18000);
select pg_temp.expect(
  (select tenant_id = 'a0000000-0000-4000-8000-000000000001' and created_by = 'mt-sales@redreach.ae'
     from public.supplier_advance_applications where id = 'ea200000-0000-4000-8000-000000000001'),
  'sales applies AED 18,000 of the advance to the first bill');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advance_applications (advance_id, expense_id, amount)
  values ('ea100000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000e2', 2500)$q$),
  'cannot apply more than the AED 2,000 still open');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advance_applications (advance_id, expense_id, amount)
  values ('ea100000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-0000000000e1', 3500)$q$),
  'cannot cover more than a bill''s total (AED 3,000 left on it)');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advance_applications (advance_id, expense_id, amount)
  values ('ea100000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000e3', 100)$q$),
  'cannot apply to a canceled bill');
insert into public.supplier_advance_applications (advance_id, expense_id, amount)
values ('ea100000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000e2', 2000);
select pg_temp.expect(
  (select sum(amount) = 20000 from public.supplier_advance_applications
    where advance_id = 'ea100000-0000-4000-8000-000000000001'),
  'the advance is fully applied over two bills');
select pg_temp.expect(pg_temp.fails($q$
  update public.supplier_advances set amount = 15000 where id = 'ea100000-0000-4000-8000-000000000001'$q$),
  'the amount cannot drop below what is applied');
update public.supplier_advances set notes = 'Deposit for steel', created_by = 'x@y'
where id = 'ea100000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select notes = 'Deposit for steel' and created_by = 'mt-sales@redreach.ae'
     from public.supplier_advances where id = 'ea100000-0000-4000-8000-000000000001'),
  'sales can edit an advance; who recorded it stays');
delete from public.supplier_advances;
delete from public.supplier_advance_applications;
reset role;
select pg_temp.expect((select count(*) from public.supplier_advances) = 2, 'sales cannot remove an advance');
select pg_temp.expect((select count(*) from public.supplier_advance_applications) = 2, 'sales cannot remove an application');

------------------------------------------------------------
-- manager and admin
------------------------------------------------------------
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.supplier_advances) = 2, 'manager reads advances');
delete from public.supplier_advance_applications
where expense_id = 'ea000000-0000-4000-8000-0000000000e2';
select pg_temp.expect((select count(*) from public.supplier_advance_applications) = 1, 'manager can un-apply from a bill');
reset role;

select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.supplier_advance_applications) = 1, 'admin reads applications');
update public.supplier_advances set amount = 19000 where id = 'ea100000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select amount = 19000 from public.supplier_advances where id = 'ea100000-0000-4000-8000-000000000001'),
  'admin can lower the amount while it stays above what is applied');
reset role;

------------------------------------------------------------
-- viewer: read only
------------------------------------------------------------
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.supplier_advances) = 2, 'viewer reads advances');
select pg_temp.expect((select count(*) from public.supplier_advance_applications) = 1, 'viewer reads applications');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount)
  values ('Viewer', 'ea000000-0000-4000-8000-0000000000a1', 10)$q$),
  'viewer cannot record an advance');
update public.supplier_advances set notes = 'viewer';
reset role;
select pg_temp.expect((select count(*) from public.supplier_advances where notes = 'viewer') = 0, 'viewer cannot change an advance');

------------------------------------------------------------
-- staff role, strangers and other tenants: nothing
------------------------------------------------------------
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.supplier_advances) = 0, 'staff role cannot read advances');
select pg_temp.expect((select count(*) from public.supplier_advance_applications) = 0, 'staff role cannot read applications');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount)
  values ('Staff', 'ea000000-0000-4000-8000-0000000000a1', 10)$q$),
  'staff role cannot record an advance');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.supplier_advances) = 0, 'stranger sees no advances');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.supplier_advances) = 0, 'tenant B cannot see tenant A advances');
select pg_temp.expect((select count(*) from public.supplier_advance_applications) = 0, 'tenant B cannot see tenant A applications');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount)
  values ('From B', 'ea000000-0000-4000-8000-0000000000a1', 10)$q$),
  'tenant B cannot record an advance on a tenant A PO');
reset role;

------------------------------------------------------------
-- AI connector: read only
------------------------------------------------------------
create or replace function pg_temp.login_mcp(who text, key uuid) returns void language plpgsql as $$
begin
  perform pg_temp.login(who);
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('request.jwt.claim.sub', true), 'role', 'authenticated', 'hm_mcp_key', key)::text, true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.login('admin');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, acts_as_user_id, created_by)
select 'ea900000-0000-4000-8000-000000000001', 'Advance test key', 'hmk_adv', repeat('8', 64), 'sales', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'mt-sales@redreach.ae';
reset role;

select pg_temp.login_mcp('sales', 'ea900000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) from public.supplier_advances) = 2, 'an AI key can read advances');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.supplier_advances (vendor_name, client_po_id, amount)
  values ('AI', 'ea000000-0000-4000-8000-0000000000a1', 10)$q$),
  'an AI key cannot record an advance');
-- Refused or matched no rows, depending on which AI policies a database has: either way nothing changes.
select pg_temp.fails($q$update public.supplier_advances set notes = 'ai' where id = 'ea100000-0000-4000-8000-000000000001'$q$);
select pg_temp.fails($q$delete from public.supplier_advances$q$);
reset role;
select pg_temp.logout();
select pg_temp.expect((select count(*) from public.supplier_advances where notes = 'ai') = 0, 'an AI key cannot change an advance');
select pg_temp.expect((select count(*) from public.supplier_advances) = 2, 'an AI key cannot remove an advance');

------------------------------------------------------------
-- a client PO with advances cannot be hard-deleted by accident
------------------------------------------------------------
select pg_temp.expect(pg_temp.fails($q$
  delete from public.client_purchase_orders where id = 'ea000000-0000-4000-8000-0000000000a1'$q$),
  'a PO with advances cannot be deleted until they are removed');

rollback;
