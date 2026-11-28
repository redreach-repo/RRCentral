-- Documents linked to a real client record (20261339090000_client_links.sql):
-- matching on save, new clients picking up unlinked documents, the review
-- list, manual links, undo, tenant checks, the Sales lock, one access check per role.
begin;
\ir _fixtures.sql

------------------------------------------------------------
-- Data (Sharjah Ready Mix from the 25 Nov brief)
------------------------------------------------------------
insert into public.clients (id, company_name, email, contacts) values
  ('c1100000-0000-4000-8000-000000000001', 'Sharjah Ready Mix Concrete Company L.L.C SP', '',
     '[{"name":"Vishraj Sasidharan","email":"purchase@sharjahreadymix.ae"}]'),
  ('c1100000-0000-4000-8000-000000000002', 'Bin Ghurair Trading', '', '[]'),
  ('c1100000-0000-4000-8000-000000000003', 'Bin Ghurair', '', '[]'),
  ('c1100000-0000-4000-8000-000000000004', 'Green Cement', 'accounts@greencement.ae', '[]');
insert into public.clients (id, company_name, tenant_id) values
  ('c1100000-0000-4000-8000-0000000000b1', 'Tenant B Client', 'b0000000-0000-4000-8000-000000000001');

insert into public.quotations (id, client, reference_number, quote_id, status, created_by) values
  ('c1200000-0000-4000-8000-000000000001', 'Green Cement L.L.C.', 'RR-01-26008', 'Q-CL1', 'Sent', 'mt-manager@redreach.ae'),
  ('c1200000-0000-4000-8000-000000000002', 'Bin Ghurair Trading LLC', 'RR-01-26990', 'Q-CL2', 'Sent', 'mt-manager@redreach.ae'),
  ('c1200000-0000-4000-8000-000000000003', 'Sharjah ReadyMix Concrete', 'RR-01-26007', 'Q-CL3', 'Sent', 'mt-manager@redreach.ae'),
  ('c1200000-0000-4000-8000-000000000004', 'Brand New Buyer', 'RR-01-26991', 'Q-CL4', 'Draft', 'mt-manager@redreach.ae');

insert into public.invoices (id, client, reference_number, amount, created_by) values
  ('c1300000-0000-4000-8000-000000000001', 'GREEN CEMENT', 'RR-01-26008', 1050, 'mt-manager@redreach.ae');

insert into public.customer_payments (id, client, invoice_ref, amount_received) values
  ('c1400000-0000-4000-8000-000000000001', 'Someone typed it differently', 'RR-01-26008', 500);

insert into public.crm (id, company_name, email_phone, owner, follow_up_date, next_action) values
  ('c1500000-0000-4000-8000-000000000001', 'SRM purchase desk', 'purchase@sharjahreadymix.ae', 'MT Manager', current_date + 3, 'Call');

------------------------------------------------------------
-- 1. Matching on save
------------------------------------------------------------
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000001') = 'c1100000-0000-4000-8000-000000000004',
  'a quote for "Green Cement L.L.C." links to client Green Cement (normalized name)');
select pg_temp.expect(
  (select client_id from public.invoices where id = 'c1300000-0000-4000-8000-000000000001') = 'c1100000-0000-4000-8000-000000000004',
  'an invoice for "GREEN CEMENT" links by exact name, any case');
select pg_temp.expect(
  (select client_id from public.customer_payments where id = 'c1400000-0000-4000-8000-000000000001') = 'c1100000-0000-4000-8000-000000000004',
  'a payment takes the client of the invoice it pays');
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000002') is null,
  'two possible clients (Bin Ghurair Trading / Bin Ghurair): no link, never guessed');
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000003') is null,
  '"Sharjah ReadyMix Concrete" is left for review, not guessed');
select pg_temp.expect(
  (select client_id from public.crm where id = 'c1500000-0000-4000-8000-000000000001') = 'c1100000-0000-4000-8000-000000000001',
  'a deal links by the contact email on the client');
select pg_temp.expect(
  (select q.client from public.quotations q where q.id = 'c1200000-0000-4000-8000-000000000001') = 'Green Cement L.L.C.',
  'the client name typed on the quote is unchanged');

-- A status change keeps the link; a client name change relinks.
update public.quotations set client_id = null where id = 'c1200000-0000-4000-8000-000000000001';
update public.quotations set status = 'Accepted' where id = 'c1200000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000001') is null,
  'saving something else never re-links a document someone unlinked');
update public.quotations set client = 'Bin Ghurair Trading' where id = 'c1200000-0000-4000-8000-000000000004';
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000004') = 'c1100000-0000-4000-8000-000000000002',
  'changing the client name re-links (exact name wins over two normalized matches)');
update public.quotations set client = 'Brand New Buyer' where id = 'c1200000-0000-4000-8000-000000000004';
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000004') is null,
  'renamed to a name with no client: link cleared');

-- A new client picks up its unlinked documents.
insert into public.clients (id, company_name) values ('c1100000-0000-4000-8000-000000000005', 'Brand New Buyer FZE');
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000004') = 'c1100000-0000-4000-8000-000000000005',
  'adding client "Brand New Buyer FZE" links the earlier quote for "Brand New Buyer"');

select pg_temp.expect(
  pg_temp.fails($$update public.quotations set client_id = 'c1100000-0000-4000-8000-0000000000b1' where id = 'c1200000-0000-4000-8000-000000000004'$$),
  'a document cannot be linked to a client of another company');

------------------------------------------------------------
-- 2. Review list, manual link, apply and undo
------------------------------------------------------------
select pg_temp.login('manager');
select pg_temp.expect(
  (select kind from public.rr_link_clients() where row_id = 'c1200000-0000-4000-8000-000000000002') = 'ambiguous',
  'manager sees the Bin Ghurair quote as ambiguous on the review list');
select pg_temp.expect(
  (select kind from public.rr_link_clients() where row_id = 'c1200000-0000-4000-8000-000000000003') = 'unmatched',
  'manager sees the Sharjah ReadyMix quote as unmatched');
select pg_temp.expect(
  pg_temp.fails($$select * from public.rr_link_clients(true)$$),
  'a manager cannot link everything at once (admins only)');
select pg_temp.expect(
  public.rr_set_document_client('quotations', 'c1200000-0000-4000-8000-000000000003', 'c1100000-0000-4000-8000-000000000001'),
  'manager links the Sharjah ReadyMix quote to the Sharjah Ready Mix client');
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000003') = 'c1100000-0000-4000-8000-000000000001',
  'the manual link is saved');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_set_document_client('quotations', 'c1200000-0000-4000-8000-000000000003', 'c1100000-0000-4000-8000-0000000000b1')$$),
  'manager cannot link to another company''s client');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_set_document_client('app_users', 'c1200000-0000-4000-8000-000000000003', null)$$),
  'only document tables can be linked');
reset role;

select pg_temp.login('admin');
create temp table t_batch as select distinct batch_id from public.rr_link_clients(true) where kind = 'match';
grant all on t_batch to authenticated;
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000001') = 'c1100000-0000-4000-8000-000000000004',
  'admin apply links the unlinked Green Cement quote again');
select pg_temp.expect(
  (select count(*) from public.client_link_log where batch_id = (select batch_id from t_batch)) >= 1,
  'the apply is logged as one batch');
select pg_temp.expect(
  public.rr_unlink_clients((select batch_id from t_batch)) >= 1,
  'admin undoes the batch');
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000001') is null,
  'undo clears only what the batch linked');
select pg_temp.expect(
  (select client_id from public.quotations where id = 'c1200000-0000-4000-8000-000000000003') = 'c1100000-0000-4000-8000-000000000001',
  'undo keeps the manual link');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  not exists (select 1 from public.rr_link_clients() where row_id = 'c1200000-0000-4000-8000-000000000002'),
  'tenant B admin never sees tenant A documents on the review list');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_set_document_client('quotations', 'c1200000-0000-4000-8000-000000000002', null)$$),
  'tenant B admin cannot link a tenant A document');
reset role;

------------------------------------------------------------
-- 3. Sales lock: a quote linked to their client is theirs
------------------------------------------------------------
delete from public.user_permissions
where user_id = (select id from public.app_users where email = 'mt-sales@redreach.ae');
insert into public.clients (id, company_name, created_by) values
  ('c1100000-0000-4000-8000-000000000006', 'Sales Own Client', 'mt-sales@redreach.ae');
insert into public.quotations (id, client, reference_number, quote_id, status, created_by, client_id) values
  ('c1200000-0000-4000-8000-000000000006', 'Typed Differently Ltd', 'RR-01-26992', 'Q-CL6', 'Sent', 'mt-manager@redreach.ae',
   'c1100000-0000-4000-8000-000000000006');

select pg_temp.login('sales');
select pg_temp.expect(
  exists (select 1 from public.quotations where id = 'c1200000-0000-4000-8000-000000000006'),
  'Sales reads a quote linked to their own client even when the typed name differs');
select pg_temp.expect(
  not exists (select 1 from public.quotations where id = 'c1200000-0000-4000-8000-000000000002'),
  'Sales still cannot read other clients'' quotes');
select pg_temp.expect(
  pg_temp.fails($$select * from public.rr_link_clients()$$),
  'Sales cannot open the review list');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_set_document_client('quotations', 'c1200000-0000-4000-8000-000000000006', null)$$),
  'Sales cannot change a document''s client link through the manager tool');
reset role;

------------------------------------------------------------
-- 4. One access check per role
------------------------------------------------------------
select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.rr_link_clients()) >= 1, 'admin: opens the review list');
select pg_temp.expect((select count(*) from public.client_link_log) >= 0, 'admin: reads the link log');
reset role;
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.rr_link_clients()) >= 1, 'manager: opens the review list');
reset role;
select pg_temp.login('staff');
select pg_temp.expect(pg_temp.fails($$select * from public.rr_link_clients()$$), 'staff: no review list');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_set_document_client('crm', 'c1500000-0000-4000-8000-000000000001', null)$$),
  'staff: cannot link documents');
reset role;
select pg_temp.login('viewer');
select pg_temp.expect(pg_temp.fails($$select * from public.rr_link_clients()$$), 'viewer: no review list');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_set_document_client('crm', 'c1500000-0000-4000-8000-000000000001', null)$$),
  'viewer: cannot link documents');
select pg_temp.expect(pg_temp.fails($$insert into public.client_link_log (batch_id, table_name, row_id, client_id) values (gen_random_uuid(), 'crm', gen_random_uuid(), gen_random_uuid())$$), 'viewer: cannot add to the link log');
reset role;
select pg_temp.login('stranger');
select pg_temp.expect(pg_temp.fails($$select * from public.rr_link_clients()$$), 'stranger: no review list');
reset role;
select pg_temp.login('sales');
select pg_temp.expect(not exists (select 1 from public.client_link_log), 'sales: cannot read the link log');
reset role;

rollback;
