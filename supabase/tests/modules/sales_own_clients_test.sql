-- Sales lockdown (20261332090000_sales_own_clients.sql). A Sales user reaches
-- only their own clients, leads, quotes, invoices, delivery notes, Client POs and
-- projects they are on, and none of the company's money. Per-person switches
-- open more. One access check per role at the end.
begin;
\ir _fixtures.sql

-- _fixtures gives mt-sales the finance.company switch so older module tests keep
-- their full-access Sales user. This test is about the lock, so take it away.
delete from public.user_permissions
where user_id = (select id from public.app_users where email = 'mt-sales@redreach.ae');

insert into auth.users values ('00000000-0000-0000-0000-0000000001a7', 'mt-sales2@redreach.ae', now())
on conflict (id) do nothing;
insert into public.app_users (email, name, role, active, tenant_id)
values ('mt-sales2@redreach.ae', 'MT Sales Two', 'sales', true, 'a0000000-0000-4000-8000-000000000001')
on conflict (email) do update set role = 'sales', active = true;

------------------------------------------------------------
-- Data: one side owned by MT Sales, one by MT Sales Two
------------------------------------------------------------
insert into public.accounts (id, type, name, owner_user_id) values
  ('5a000000-0000-4000-8000-000000000001', 'ai_crm_client', 'Own Account LLC',
     (select id from public.app_users where email = 'mt-sales@redreach.ae')),
  ('5a000000-0000-4000-8000-000000000002', 'ai_crm_client', 'Other Account LLC',
     (select id from public.app_users where email = 'mt-sales2@redreach.ae'));

insert into public.crm (id, company_name, owner, created_by) values
  ('5b000000-0000-4000-8000-000000000001', 'Own Lead Co', 'MT Sales', 'mt-manager@redreach.ae'),
  ('5b000000-0000-4000-8000-000000000002', 'Other Lead Co', 'MT Sales Two', 'mt-manager@redreach.ae'),
  ('5b000000-0000-4000-8000-000000000003', 'Unassigned Lead Co', '', 'mt-sales@redreach.ae'),
  ('5b000000-0000-4000-8000-000000000004', 'Email Owner Co', 'MT-SALES@redreach.ae', 'mt-manager@redreach.ae');

insert into public.clients (id, company_name, created_by) values
  ('5c000000-0000-4000-8000-000000000001', 'Own Lead Co L.L.C', 'mt-manager@redreach.ae'),
  ('5c000000-0000-4000-8000-000000000002', 'Other Lead Co', 'mt-manager@redreach.ae');
insert into public.clients (id, company_name, account_id, created_by) values
  ('5c000000-0000-4000-8000-000000000003', 'Own Account', '5a000000-0000-4000-8000-000000000001', 'mt-manager@redreach.ae');

insert into public.quotations (id, client, reference_number, quote_id, created_by, supplier_cost_base) values
  ('5d000000-0000-4000-8000-000000000001', 'Own Lead Co', 'RR-01-26901', 'Q-901', 'mt-manager@redreach.ae', 100),
  ('5d000000-0000-4000-8000-000000000002', 'Other Lead Co', 'RR-01-26902', 'Q-902', 'mt-sales2@redreach.ae', 100),
  ('5d000000-0000-4000-8000-000000000003', 'Fresh Client', 'RR-01-26903', 'Q-903', 'mt-sales@redreach.ae', 100);
-- a manager's revision of the Sales user's quote stays with the Sales user
insert into public.quotations (id, client, reference_number, quote_id, base_reference, revision, created_by) values
  ('5d000000-0000-4000-8000-000000000004', 'Renamed Client', 'RR-01-26901-R1', 'Q-901-R1', 'RR-01-26901', 1, 'mt-manager@redreach.ae');

insert into public.invoices (id, client, reference_number, created_by, amount) values
  ('5e000000-0000-4000-8000-000000000001', 'Own Lead Co', 'RR-01-26901', 'mt-manager@redreach.ae', 1050),
  ('5e000000-0000-4000-8000-000000000002', 'Other Lead Co', 'RR-01-26902', 'mt-sales2@redreach.ae', 1050);

insert into public.delivery_notes (id, client, reference_number, quote_ref, created_by) values
  ('5f000000-0000-4000-8000-000000000001', 'Someone Else', 'DN-01-26901', 'RR-01-26901', 'mt-manager@redreach.ae'),
  ('5f000000-0000-4000-8000-000000000002', 'Other Lead Co', 'DN-01-26902', 'RR-01-26902', 'mt-manager@redreach.ae');

insert into public.line_items (doc_type, reference, description, unit_price, unit_cost) values
  ('Quote', 'Q-901', 'own quote line', 10, 6),
  ('Quote', 'Q-902', 'other quote line', 10, 6),
  ('Invoice', 'RR-01-26901', 'own invoice line', 10, 6),
  ('Invoice', 'RR-01-26902', 'other invoice line', 10, 6),
  ('DeliveryNote', 'DN-01-26901', 'own dn line', 0, 0),
  ('DeliveryNote', 'DN-01-26902', 'other dn line', 0, 0);

insert into public.client_purchase_orders (id, po_number, client_id, amount) values
  ('5f100000-0000-4000-8000-000000000001', 'PO-OWN', '5c000000-0000-4000-8000-000000000001', 500),
  ('5f100000-0000-4000-8000-000000000002', 'PO-OTHER', '5c000000-0000-4000-8000-000000000002', 500);

insert into public.income (reference_number, client_source, total_amount) values
  ('RR-01-26901', 'Own Lead Co', 1050), ('RR-01-26902', 'Other Lead Co', 1050), ('RR-99-OTHER', 'Misc', 77);
insert into public.payment_log (invoice_ref, client, amount) values
  ('RR-01-26901', 'Own Lead Co', 50), ('RR-01-26902', 'Other Lead Co', 50);
insert into public.customer_payments (invoice_ref, client, amount_received) values
  ('RR-01-26901', 'Own Lead Co', 50), ('RR-01-26902', 'Other Lead Co', 50);
insert into public.expenses (vendor) values ('Lockdown Fuel');
insert into public.vendors (company_name) values ('Lockdown Supplier');

insert into public.delivery_projects (id, name, budget_aed) values
  ('5f200000-0000-4000-8000-000000000001', 'Project I am on', 1000),
  ('5f200000-0000-4000-8000-000000000002', 'Project I am not on', 1000);
insert into public.delivery_project_members (project_id, user_id) values
  ('5f200000-0000-4000-8000-000000000001', (select id from public.app_users where email = 'mt-sales@redreach.ae'));
insert into public.project_cost_lines (project_id, amount_aed, description) values
  ('5f200000-0000-4000-8000-000000000001', 400, 'labour');

------------------------------------------------------------
-- sales: own clients only
------------------------------------------------------------
select pg_temp.login('sales');
select pg_temp.expect(
  (select array_agg(name order by name) from public.accounts where id::text like '5a000000%') = array['Own Account LLC'],
  'sales sees only the account they own');
select pg_temp.expect(public.rr_can_read_account('5a000000-0000-4000-8000-000000000001'), 'account helper: own account readable');
select pg_temp.expect(not public.rr_can_read_account('5a000000-0000-4000-8000-000000000002'), 'account helper: other account hidden (contracts, deals, tickets)');
select pg_temp.expect(
  (select array_agg(company_name order by company_name) from public.crm where id::text like '5b000000%')
    = array['Email Owner Co', 'Own Lead Co', 'Unassigned Lead Co'],
  'sales sees their leads (owner by name or email, any case, or unassigned leads they added), not others');
select pg_temp.expect(
  (select array_agg(company_name order by company_name) from public.clients where id::text like '5c000000%')
    = array['Own Account', 'Own Lead Co L.L.C'],
  'sales sees clients linked to their account or lead (name match ignores L.L.C), not others');
select pg_temp.expect(
  (select array_agg(reference_number order by reference_number) from public.quotations where id::text like '5d000000%')
    = array['RR-01-26901', 'RR-01-26901-R1', 'RR-01-26903'],
  'sales sees quotes for their clients, quotes they made and revisions of them');
select pg_temp.expect(
  (select array_agg(reference_number order by reference_number) from public.invoices where id::text like '5e000000%')
    = array['RR-01-26901'],
  'sales sees only invoices of their clients');
select pg_temp.expect(
  (select array_agg(reference_number order by reference_number) from public.delivery_notes where id::text like '5f000000%')
    = array['DN-01-26901'],
  'sales sees delivery notes of their quotes');
select pg_temp.expect(
  (select array_agg(description order by description) from public.line_items where description like '%line')
    = array['own dn line', 'own invoice line', 'own quote line'],
  'sales sees only the lines of their own documents');
select pg_temp.expect(
  (select array_agg(po_number) from public.client_purchase_orders where id::text like '5f100000%') = array['PO-OWN'],
  'sales sees only Client POs of their clients');
select pg_temp.expect(
  (select array_agg(reference_number) from public.income where reference_number in ('RR-01-26901', 'RR-01-26902', 'RR-99-OTHER'))
    = array['RR-01-26901'],
  'sales sees income only for their own invoices');
select pg_temp.expect((select count(*) from public.payment_log where invoice_ref like 'RR-01-269%') = 1, 'sales sees payments of their own invoices only');
select pg_temp.expect((select count(*) from public.customer_payments where invoice_ref like 'RR-01-269%') = 1, 'sales sees customer payments of their own invoices only');
select pg_temp.expect((select count(*) from public.expenses) = 0, 'sales sees no expenses');
select pg_temp.expect((select count(*) from public.vendors) = 0, 'sales sees no vendors');
select pg_temp.expect(
  (select array_agg(name) from public.delivery_projects where id::text like '5f200000%') = array['Project I am on'],
  'sales sees only the projects they are on');
select pg_temp.expect((select count(*) from public.project_cost_lines) = 0, 'sales sees no project costs');

-- They cannot touch other people's work.
update public.quotations set notes = 'hijack' where id = '5d000000-0000-4000-8000-000000000002';
update public.crm set notes = 'hijack' where id = '5b000000-0000-4000-8000-000000000002';
update public.invoices set notes = 'hijack' where id = '5e000000-0000-4000-8000-000000000002';

-- Their own flow: lead -> quote -> invoice (+ income line) -> delivery note -> Client PO.
insert into public.crm (company_name, owner, created_by) values ('New Prospect', 'MT Sales', 'mt-sales@redreach.ae');
select pg_temp.expect((select count(*) from public.crm where company_name = 'New Prospect') = 1, 'sales adds their own lead');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.crm (company_name, owner, created_by) values ('Planted Lead', 'MT Sales Two', 'mt-sales@redreach.ae')$q$),
  'sales cannot add a lead owned by someone else');
insert into public.clients (id, company_name) values ('5c000000-0000-4000-8000-000000000009', 'Brand New Client');
select pg_temp.expect(
  (select created_by from public.clients where id = '5c000000-0000-4000-8000-000000000009') = 'mt-sales@redreach.ae',
  'a client they add is stamped as theirs and stays visible');
insert into public.quotations (id, client, reference_number, quote_id, created_by) values
  ('5d000000-0000-4000-8000-000000000009', 'Brand New Client', 'RR-01-26909', 'Q-909', 'mt-sales@redreach.ae');
insert into public.line_items (doc_type, reference, description) values ('Quote', 'Q-909', 'new quote line');
select pg_temp.expect((select count(*) from public.line_items where reference = 'Q-909') = 1, 'sales creates a quote with lines');
insert into public.invoices (client, reference_number, created_by) values ('Brand New Client', 'RR-01-26909', 'mt-sales@redreach.ae');
insert into public.income (reference_number, client_source, total_amount) values ('RR-01-26909', 'Brand New Client', 10);
update public.income set status = 'Open' where reference_number = 'RR-01-26909';
select pg_temp.expect((select count(*) from public.income where reference_number = 'RR-01-26909') = 1, 'the invoice screen can keep income in step for their invoice');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.income (reference_number, client_source, total_amount) values ('RR-01-26902', 'x', 1)$q$),
  'sales cannot write income for someone else''s invoice');
insert into public.delivery_notes (client, reference_number, quote_ref, created_by)
values ('Brand New Client', 'DN-01-26909', 'RR-01-26909', 'mt-sales@redreach.ae');
select pg_temp.expect((select count(*) from public.delivery_notes where reference_number = 'DN-01-26909') = 1, 'sales creates a delivery note');
insert into public.client_purchase_orders (po_number, client_id, quotation_id)
values ('PO-NEW', '5c000000-0000-4000-8000-000000000009', '5d000000-0000-4000-8000-000000000009');
select pg_temp.expect((select count(*) from public.client_purchase_orders where po_number = 'PO-NEW') = 1, 'sales records a Client PO for their client');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.client_purchase_orders (po_number, client_id) values ('PO-PLANT', '5c000000-0000-4000-8000-000000000002')$q$),
  'sales cannot record a PO against someone else''s client');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.payment_log (invoice_ref, amount) values ('RR-01-26909', 10)$q$),
  'sales cannot record payments');
select pg_temp.expect(pg_temp.fails($q$insert into public.expenses (vendor) values ('Sneaky')$q$), 'sales cannot add expenses');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.delivery_project_members (project_id, user_id)
  values ('5f200000-0000-4000-8000-000000000002', (select public.rr_current_user_id()))$q$),
  'sales cannot add themselves to a project');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.user_permissions (user_id, permission) values ((select public.rr_current_user_id()), 'finance.company')$q$),
  'sales cannot switch on their own permissions');
select pg_temp.expect(public.rr_allocate_reference('quotation', '01') like 'RR-01-%', 'sales still gets a fresh company-wide reference number');
reset role;

select pg_temp.expect((select notes from public.quotations where id = '5d000000-0000-4000-8000-000000000002') <> 'hijack', 'sales cannot change another person''s quote');
select pg_temp.expect((select notes from public.crm where id = '5b000000-0000-4000-8000-000000000002') <> 'hijack', 'sales cannot change another person''s lead');
select pg_temp.expect((select notes from public.invoices where id = '5e000000-0000-4000-8000-000000000002') <> 'hijack', 'sales cannot change another person''s invoice');

------------------------------------------------------------
-- switches: only admins set them; stamped and audited
------------------------------------------------------------
select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.user_permissions (user_id, permission)
  values ((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'clients.view_all')$q$),
  'a manager cannot switch permissions');
reset role;

select pg_temp.login('admin');
insert into public.user_permissions (user_id, permission, granted_by)
values ((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'clients.view_all', 'forged@example.com');
select pg_temp.expect(
  (select granted_by from public.user_permissions where permission = 'clients.view_all'
     and user_id = (select id from public.app_users where email = 'mt-sales@redreach.ae')) = 'mt-admin@redreach.ae',
  'who switched it comes from the session');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.user_permissions (user_id, permission)
  values ((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'see.everything')$q$),
  'only known switches');
reset role;
select pg_temp.expect(exists (
  select 1 from public.audit_log where table_name = 'user_permissions' and operation = 'INSERT'
), 'switching a permission is in the audit log');

-- clients.view_all: read everyone's clients and leads, edit none of them.
select pg_temp.login('sales');
select pg_temp.expect((select count(*) from public.crm where id = '5b000000-0000-4000-8000-000000000002') = 1, 'view-all switch: sales reads another person''s lead');
select pg_temp.expect((select count(*) from public.accounts where id = '5a000000-0000-4000-8000-000000000002') = 1, 'view-all switch: sales reads another person''s account');
update public.crm set notes = 'hijack again' where id = '5b000000-0000-4000-8000-000000000002';
select pg_temp.expect((select count(*) from public.invoices where id = '5e000000-0000-4000-8000-000000000002') = 0, 'view-all switch does not open invoices');
reset role;
select pg_temp.expect((select notes from public.crm where id = '5b000000-0000-4000-8000-000000000002') <> 'hijack again', 'view-all switch is read only');

-- finance.company: the old full Sales access.
insert into public.user_permissions (user_id, permission)
values ((select id from public.app_users where email = 'mt-sales@redreach.ae'), 'finance.company');
select pg_temp.login('sales');
select pg_temp.expect((select count(*) from public.expenses where vendor = 'Lockdown Fuel') = 1, 'finance switch: sales sees expenses');
select pg_temp.expect((select count(*) from public.invoices where id = '5e000000-0000-4000-8000-000000000002') = 1, 'finance switch: sales sees every invoice');
reset role;

------------------------------------------------------------
-- other roles are unchanged
------------------------------------------------------------
select pg_temp.login('sales');
-- the other Sales user has no switches and sees only their side
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000001a7';
select pg_temp.expect(
  (select array_agg(reference_number order by reference_number) from public.quotations where id::text like '5d000000%')
    = array['RR-01-26902'],
  'a second Sales user sees only their own quote');
select pg_temp.expect((select count(*) from public.delivery_projects where id::text like '5f200000%') = 0, 'a second Sales user is on no project');
reset role;

select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.quotations where id::text like '5d000000%') = 5, 'manager sees every quote');
select pg_temp.expect((select count(*) from public.expenses where vendor = 'Lockdown Fuel') = 1, 'manager sees expenses');
insert into public.delivery_project_members (project_id, user_id)
values ('5f200000-0000-4000-8000-000000000002', (select id from public.app_users where email = 'mt-sales2@redreach.ae'));
select pg_temp.expect((select count(*) from public.delivery_project_members) = 2, 'manager adds people to projects');
reset role;

select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.invoices where id::text like '5e000000%') = 2, 'admin sees every invoice');
reset role;

select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.quotations where id::text like '5d000000%') = 5, 'viewer still reads every quote (unchanged)');
reset role;

select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.quotations where id::text like '5d000000%') = 0, 'staff still sees no quotes (unchanged)');
select pg_temp.expect((select count(*) from public.user_permissions) = 0, 'staff sees nobody''s switches');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.user_permissions) = 0, 'another tenant sees no switches');
select pg_temp.expect((select count(*) from public.delivery_project_members) = 0, 'another tenant sees no project members');
reset role;

rollback;
