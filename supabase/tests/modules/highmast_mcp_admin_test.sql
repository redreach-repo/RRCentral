-- HighMast MCP admin keys (20261324090000_highmast_mcp_admin.sql).
-- Runs every admin write tool's database function against test records as an
-- AI session with an admin key, then rolls everything back:
--   * only admins make admin keys, which act as a separate AI Assistant admin member
--   * an admin key reads and writes business tables, HR and payroll included,
--     but never settings, secrets, keys or users, and never hard deletes
--   * quotes: create / update (Draft only), finalize (RR reference), mark sent, convert
--   * invoices: draft, finalize; a sent invoice is locked; payments, reversal, credit note
--   * payroll stays draft, leave cannot be approved by the AI
--   * every write is in audit_log with before and after, salary and IBAN hidden
--   * standard (sales) keys keep their old limits; people are not affected
begin;
\ir _fixtures.sql

insert into auth.users values ('00000000-0000-0000-0000-0000000001c1', 'ai-assistant@redreach.ae', now())
on conflict (id) do nothing;
insert into public.app_users (email, name, role, active, tenant_id)
values ('ai-assistant@redreach.ae', 'AI Assistant', 'admin', true, 'a0000000-0000-4000-8000-000000000001')
on conflict (email) do update set role = 'admin', active = true;

create or replace function pg_temp.login_ai(sub text, key uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', sub, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', sub, 'role', 'authenticated', 'hm_mcp_key', key)::text, true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Records to work with.
insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values ('e6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'MCPA-1', 'Test Employee', 'active')
on conflict do nothing;
insert into public.app_settings (key, value) values ('mcp.test.setting', 'x') on conflict do nothing;

------------------------------------------------------------
-- Keys
------------------------------------------------------------
select pg_temp.login('admin');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, acts_as_user_id, created_by)
select 'e6900000-0000-4000-8000-000000000001', 'AI Assistant', 'hmk_admn', repeat('9', 64), 'admin', 'admin', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'ai-assistant@redreach.ae';
select pg_temp.expect((select count(*) from public.mcp_keys where id = 'e6900000-0000-4000-8000-000000000001') = 1,
  'an admin creates an admin key for the AI Assistant member');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, acts_as_user_id)
  select 'Me', repeat('8', 64), 'admin', 'admin', u.id from public.app_users u where u.email = 'mt-admin@redreach.ae'$q$),
  'an admin key cannot act as the admin creating it');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, acts_as_user_id)
  select 'Mixed', repeat('7', 64), 'admin', 'standard', u.id from public.app_users u where u.email = 'ai-assistant@redreach.ae'$q$),
  'a standard key cannot act as an admin');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, acts_as_user_id)
  select 'Mixed', repeat('6', 64), 'sales', 'admin', u.id from public.app_users u where u.email = 'mt-sales@redreach.ae'$q$),
  'an admin key cannot act as a sales member');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, acts_as_user_id, created_by)
select 'e6900000-0000-4000-8000-000000000002', 'Grok Sales', 'hmk_sale', repeat('5', 64), 'sales', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'mt-sales@redreach.ae';
reset role;
select pg_temp.logout();

select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, acts_as_user_id)
  select 'Mgr', repeat('4', 64), 'admin', 'admin', u.id from public.app_users u where u.email = 'ai-assistant@redreach.ae'$q$),
  'a manager cannot make admin keys');
reset role;
select pg_temp.logout();

set local role anon;
select pg_temp.expect((select scope from public.rr_mcp_resolve_key(repeat('9', 64))) = 'admin', 'an admin key resolves with scope admin');
select pg_temp.expect((select role from public.rr_mcp_resolve_key(repeat('9', 64))) = 'admin', 'and acts as the admin AI Assistant');
select pg_temp.expect((select scope from public.rr_mcp_resolve_key(repeat('5', 64))) = 'standard', 'a sales key is standard');
reset role;

------------------------------------------------------------
-- Standard keys are unchanged
------------------------------------------------------------
select pg_temp.login_ai('00000000-0000-0000-0000-0000000001a3', 'e6900000-0000-4000-8000-000000000002');
select pg_temp.expect(not public.rr_mcp_admin_key(), 'a sales key is not an admin key');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'a sales key still cannot read HR');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('accounts', null, '{"name":"X","type":"ai_crm_client"}'::jsonb)$q$),
  'a sales key cannot use the admin write functions');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_quote_save(null, '{"client":"X"}'::jsonb, '[{"description":"a","quantity":1,"unit_price":1}]'::jsonb)$q$),
  'a sales key cannot create quotes');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- Admin key: what it can reach
------------------------------------------------------------
select pg_temp.login_ai('00000000-0000-0000-0000-0000000001c1', 'e6900000-0000-4000-8000-000000000001');
select pg_temp.expect(public.rr_mcp_admin_key(), 'the session is an admin AI session');
select pg_temp.expect((select count(*) from public.hr_employees where id = 'e6000000-0000-4000-8000-000000000001') = 1, 'admin key reads HR people');
select pg_temp.expect((select count(*) from public.payroll_runs) >= 0, 'admin key can query payroll runs');
select pg_temp.expect((select count(*) from public.app_settings) = 0, 'admin key cannot read settings');
select pg_temp.expect((select count(*) from public.mcp_keys) = 0, 'admin key cannot read keys');
select pg_temp.expect((select count(*) from public.app_users) > 0, 'admin key can list users');
select pg_temp.expect(pg_temp.fails($q$update public.app_users set role = 'admin' where email = 'mt-sales@redreach.ae'$q$)
  or (select role from public.app_users where email = 'mt-sales@redreach.ae') = 'sales', 'admin key cannot change users');
select pg_temp.expect(pg_temp.fails($q$insert into public.app_users (email, name, role, active) values ('x@y.z', 'X', 'admin', true)$q$),
  'admin key cannot add users');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('app_settings', null, '{"key":"a","value":"b"}'::jsonb)$q$),
  'admin key cannot write settings');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('app_users', null, '{"email":"a@b.c"}'::jsonb)$q$),
  'admin key cannot write users through the save function');

------------------------------------------------------------
-- Accounts, contacts: create, update, soft delete, restore, never hard delete
------------------------------------------------------------
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'account', (public.rr_mcp_save('accounts', null,
  '{"name":"MCP Admin Test LLC","type":"ai_crm_client","status":"prospect","country":"UAE"}'::jsonb, 'create_account') ->> 'id')::uuid;
select pg_temp.expect((select name from public.accounts where id = (select v from ids where k = 'account')) = 'MCP Admin Test LLC', 'create_account');
select pg_temp.expect((public.rr_mcp_save('accounts', (select v from ids where k = 'account'), '{"city":"Dubai"}'::jsonb, 'update_account') ->> 'city') = 'Dubai', 'update_account');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('accounts', null, '{"name":"A","type":"ai_crm_client","tenant_id":"b0000000-0000-4000-8000-000000000001"}'::jsonb)$q$),
  'the AI cannot set tenant_id');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('accounts', null, '{"name":"A","type":"ai_crm_client","no_such_col":1}'::jsonb)$q$),
  'unknown fields are refused');
insert into ids select 'contact', (public.rr_mcp_save('account_contacts', null,
  jsonb_build_object('account_id', (select v from ids where k = 'account'), 'name', 'Test Person', 'email', 't@example.com'), 'create_contact') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.account_contacts where id = (select v from ids where k = 'contact')) = 1, 'create_contact');

delete from public.accounts where id = (select v from ids where k = 'account');
select pg_temp.expect((select count(*) from public.accounts where id = (select v from ids where k = 'account')) = 1, 'a hard delete removes nothing');
select pg_temp.expect((public.rr_mcp_set_deleted('accounts', (select v from ids where k = 'account'), true) ->> 'deleted_at') is not null, 'delete_record soft deletes');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('accounts', (select v from ids where k = 'account'), '{"city":"X"}'::jsonb)$q$),
  'a deleted record cannot be edited');
select pg_temp.expect((public.rr_mcp_set_deleted('accounts', (select v from ids where k = 'account'), false, 'restore_record') ->> 'deleted_at') is null, 'restore_record');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_set_deleted('hr_leave_requests', gen_random_uuid(), true)$q$),
  'tables without soft delete have no delete');

------------------------------------------------------------
-- Deals in any direction, closed as won
------------------------------------------------------------
insert into ids select 'deal', (public.rr_mcp_save('sales_deals', null,
  jsonb_build_object('account_id', (select v from ids where k = 'account'), 'stage', 'lead', 'next_action', 'Call', 'next_action_date', current_date + 2),
  'create_deal') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.sales_deals where id = (select v from ids where k = 'deal')) = 1, 'create_deal');
select pg_temp.expect((public.rr_mcp_save('sales_deals', (select v from ids where k = 'deal'), '{"stage":"quote_sent"}'::jsonb, 'move_deal_stage_any') ->> 'stage') = 'quote_sent', 'move a deal forward');
select pg_temp.expect((public.rr_mcp_save('sales_deals', (select v from ids where k = 'deal'), '{"stage":"discovery_call"}'::jsonb, 'move_deal_stage_any') ->> 'stage') = 'discovery_call', 'and back');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('sales_deals', (select v from ids where k = 'deal'), '{"stage":"lost"}'::jsonb)$q$),
  'closing as lost still needs the reason the app asks for');
select pg_temp.expect((public.rr_mcp_save('sales_deals', (select v from ids where k = 'deal'), '{"stage":"signed"}'::jsonb, 'close_deal') ->> 'stage') = 'signed', 'close a deal as signed');

------------------------------------------------------------
-- Quote: create, update, finalize, lock, mark sent, convert
------------------------------------------------------------
-- 2 x 100 at 10% off = 180, 1 x 50 = 50: subtotal 230, VAT 5% 11.50, total 241.50.
insert into ids select 'quote', ((public.rr_mcp_quote_save(null,
  jsonb_build_object('client', 'MCP Admin Test LLC', 'account_id', (select v from ids where k = 'account'), 'vertical', 'RR Threads', 'division_code', '01'),
  '[{"description":"Polo shirt","quantity":2,"unit_price":100,"discount_percent":10},{"description":"Cap","quantity":1,"unit_price":50}]'::jsonb)
  -> 'quote') ->> 'id')::uuid;
select pg_temp.expect((select amount from public.quotations where id = (select v from ids where k = 'quote')) = 241.50, 'create_quote: total 241.50 with 5% VAT');
select pg_temp.expect((select status from public.quotations where id = (select v from ids where k = 'quote')) = 'Draft', 'create_quote: status Draft');
select pg_temp.expect((select currency from public.quotations where id = (select v from ids where k = 'quote')) = 'AED', 'create_quote: AED by default');
select pg_temp.expect((select count(*) from public.line_items l join public.quotations q on q.quote_id = l.reference and l.doc_type = 'Quote'
                       where q.id = (select v from ids where k = 'quote')) = 2, 'create_quote: two lines');
select pg_temp.expect((select unit_price from public.line_items l join public.quotations q on q.quote_id = l.reference and l.doc_type = 'Quote'
                       where q.id = (select v from ids where k = 'quote') and l.line_no = 1) = 90, 'a line discount comes off the unit price');
select pg_temp.expect(((public.rr_mcp_quote_save((select v from ids where k = 'quote'), '{"notes":"Updated"}'::jsonb,
  '[{"description":"Polo shirt","quantity":3,"unit_price":100}]'::jsonb) -> 'totals') ->> 'total')::numeric = 315, 'update_quote: 3 x 100 + 5% = 315');
select pg_temp.expect(((public.rr_mcp_quote_finalize((select v from ids where k = 'quote'))) ->> 'reference_number') ~ ('^RR-01-' || to_char(now(), 'YY') || '\d{3}$'),
  'finalize_quote gives an RR-01-YYnnn reference');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_quote_save((select v from ids where k = 'quote'), '{"notes":"x"}'::jsonb, null)$q$),
  'a finalized quote cannot be edited');
select pg_temp.expect(pg_temp.fails($q$update public.quotations set amount = 1 where id = (select v from ids where k = 'quote')$q$),
  'nor its amount directly');
select pg_temp.expect(pg_temp.fails($q$update public.line_items set unit_price = 1 where doc_type = 'Quote'
  and reference = (select quote_id from public.quotations where id = (select v from ids where k = 'quote'))$q$),
  'nor its lines');
select pg_temp.expect((public.rr_mcp_quote_mark_sent((select v from ids where k = 'quote')) ->> 'status') = 'Sent', 'mark_quote_sent');
select pg_temp.expect((select sent_at from public.quotations where id = (select v from ids where k = 'quote')) is not null, 'sent_at is set');
insert into ids select 'invoice', ((public.rr_mcp_quote_to_invoice((select v from ids where k = 'quote')) -> 'invoice') ->> 'id')::uuid;
select pg_temp.expect((select amount from public.invoices where id = (select v from ids where k = 'invoice')) = 315, 'convert_quote_to_invoice: same total');
select pg_temp.expect((select reference_number from public.invoices where id = (select v from ids where k = 'invoice'))
  = (select reference_number from public.quotations where id = (select v from ids where k = 'quote')), 'the invoice keeps the quote reference');
select pg_temp.expect((select status from public.invoices where id = (select v from ids where k = 'invoice')) = 'Sent', 'the invoice is Sent');
select pg_temp.expect((select total_amount from public.income where reference_number =
  (select reference_number from public.invoices where id = (select v from ids where k = 'invoice'))) = 315, 'income row written');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_quote_to_invoice((select v from ids where k = 'quote'))$q$),
  'a quote converts only once');

------------------------------------------------------------
-- A sent invoice is locked; payments, reversal, credit note
------------------------------------------------------------
select pg_temp.expect(pg_temp.fails($q$update public.invoices set description = 'changed' where id = (select v from ids where k = 'invoice')$q$),
  'a sent invoice cannot be edited');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_invoice_save((select v from ids where k = 'invoice'), '{"notes":"x"}'::jsonb, null)$q$),
  'update_invoice refuses a sent invoice');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_set_deleted('invoices', (select v from ids where k = 'invoice'), true)$q$),
  'a sent invoice cannot be deleted');
insert into ids select 'payment', ((public.rr_mcp_record_payment((select v from ids where k = 'invoice'), 100, current_date, 'Bank transfer', 'TRX-1')
  -> 'payment') ->> 'id')::uuid;
select pg_temp.expect((select payment_status from public.invoices where id = (select v from ids where k = 'invoice')) = 'Partial', 'record_payment: Partial');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_record_payment((select v from ids where k = 'invoice'), 1000, current_date, 'Cash')$q$),
  'no payment above the balance');
select pg_temp.expect(pg_temp.fails($q$update public.payment_log set amount = 1 where id = (select v from ids where k = 'payment')$q$),
  'a recorded payment cannot be changed');
select pg_temp.expect((public.rr_mcp_reverse_payment((select v from ids where k = 'payment'), 'Bounced') ->> 'payment_status') = 'Pending', 'reverse_payment: back to Pending');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_reverse_payment((select v from ids where k = 'payment'), 'again')$q$),
  'a payment is reversed only once');
select pg_temp.expect(((public.rr_mcp_credit_note((select v from ids where k = 'invoice'), 15, 'One shirt returned') -> 'credit_note') ->> 'amount')::numeric = -15,
  'create_credit_note: -15');
select pg_temp.expect((public.rr_mcp_invoice_balance((select v from ids where k = 'invoice')) ->> 'balance')::numeric = 300, 'balance after the credit note: 300');
select public.rr_mcp_record_payment((select v from ids where k = 'invoice'), 300, current_date, 'Bank transfer', 'TRX-2');
select pg_temp.expect((select payment_status from public.invoices where id = (select v from ids where k = 'invoice')) = 'Paid', 'record_payment: Paid in full');

------------------------------------------------------------
-- Draft invoice: create, update, delete, finalize
------------------------------------------------------------
insert into ids select 'draft', ((public.rr_mcp_invoice_save(null, '{"client":"MCP Admin Test LLC","vertical":"RR Threads"}'::jsonb,
  '[{"description":"Service","quantity":1,"unit_price":1000}]'::jsonb) -> 'invoice') ->> 'id')::uuid;
select pg_temp.expect((select status from public.invoices where id = (select v from ids where k = 'draft')) = 'Draft', 'create_invoice: Draft');
select pg_temp.expect((select reference_number from public.invoices where id = (select v from ids where k = 'draft')) ~ '^INV-DRAFT-', 'a draft has a temporary reference');
select pg_temp.expect((select amount from public.invoices where id = (select v from ids where k = 'draft')) = 1050, 'create_invoice: 1000 + 5% = 1050');
select pg_temp.expect(((public.rr_mcp_invoice_save((select v from ids where k = 'draft'), '{"notes":"x"}'::jsonb,
  '[{"description":"Service","quantity":2,"unit_price":1000}]'::jsonb) -> 'invoice') ->> 'amount')::numeric = 2100, 'update_invoice while Draft');
select pg_temp.expect(((public.rr_mcp_invoice_save((select v from ids where k = 'draft'), '{}'::jsonb, null, 0.05, true) -> 'invoice') ->> 'reference_number')
  ~ ('^RR-01-' || to_char(now(), 'YY') || '\d{3}$'), 'finalize_invoice gives an RR reference');
select pg_temp.expect((select count(*) from public.line_items where doc_type = 'Invoice' and reference =
  (select reference_number from public.invoices where id = (select v from ids where k = 'draft'))) = 1, 'its lines moved to the new reference');

------------------------------------------------------------
-- Expenses, tickets, documents, delivery, operations
------------------------------------------------------------
select pg_temp.expect((public.rr_mcp_save('expenses', null,
  '{"date":"2026-11-20","vendor":"Test Vendor","category":"Office","amount":105,"amount_ex_vat":100,"vat_amount":5,"status":"Recorded"}'::jsonb, 'create_expense') ->> 'amount')::numeric = 105,
  'create_expense');
insert into ids select 'ticket', (public.rr_mcp_save('tickets', null,
  jsonb_build_object('account_id', (select v from ids where k = 'account'), 'subject', 'Test ticket', 'channel', 'internal', 'priority', 'normal', 'status', 'new'), 'create_ticket') ->> 'id')::uuid;
select pg_temp.expect((public.rr_mcp_save('ticket_messages', null,
  jsonb_build_object('ticket_id', (select v from ids where k = 'ticket'), 'author_kind', 'user', 'author_user_id', (select id from public.app_users where email = 'ai-assistant@redreach.ae'), 'author_label', 'AI Assistant', 'body', 'Hello'), 'reply_ticket') ->> 'body') = 'Hello',
  'reply_ticket');
select pg_temp.expect((public.rr_mcp_save('tickets', (select v from ids where k = 'ticket'), '{"status":"closed"}'::jsonb, 'close_ticket') ->> 'status') = 'closed', 'close_ticket');
select pg_temp.expect((public.rr_mcp_save('customer_documents', null,
  '{"company_name":"MCP Admin Test LLC","category":"Contract","title":"Test doc","drive_url":"https://drive.google.com/x"}'::jsonb, 'add_document') ->> 'title') = 'Test doc',
  'add_document');
select pg_temp.expect((public.rr_mcp_save('delivery_projects', null,
  jsonb_build_object('account_id', (select v from ids where k = 'account'), 'code', 'MCP-P1', 'name', 'Test project', 'status', 'planned'), 'create_record') ->> 'name') = 'Test project',
  'create a delivery project');
select pg_temp.expect((public.rr_mcp_save('purchase_orders', null,
  '{"po_number":"PO-MCP-1","vendor_name":"Test Vendor","status":"draft"}'::jsonb, 'create_record') ->> 'status') = 'draft',
  'create a purchase order');

------------------------------------------------------------
-- HR and payroll
------------------------------------------------------------
select pg_temp.expect((public.rr_mcp_save('hr_employees', 'e6000000-0000-4000-8000-000000000001',
  '{"job_title":"Designer","basic_salary_aed":9000,"iban":"AE070331234567890123456"}'::jsonb, 'update_employee') ->> 'job_title') = 'Designer',
  'update_employee');
insert into ids select 'emp', (public.rr_mcp_save('hr_employees', null,
  '{"employee_code":"MCPA-2","full_name":"New Starter","employment_status":"onboarding"}'::jsonb, 'create_employee') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.hr_employees where id = (select v from ids where k = 'emp')) = 1, 'create_employee');
insert into ids select 'leave', (public.rr_mcp_save('hr_leave_requests', null,
  jsonb_build_object('employee_id', (select v from ids where k = 'emp'), 'leave_type', 'annual', 'starts_on', '2026-12-01', 'ends_on', '2026-12-03', 'days', 3, 'status', 'pending'),
  'create_leave') ->> 'id')::uuid;
select pg_temp.expect((select status from public.hr_leave_requests where id = (select v from ids where k = 'leave')) = 'pending', 'create_leave: pending');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('hr_leave_requests', (select v from ids where k = 'leave'), '{"status":"approved"}'::jsonb)$q$),
  'the AI cannot approve leave');
insert into ids select 'run', (public.rr_mcp_save('payroll_runs', null, '{"period_yyyy_mm":"2026-12","status":"draft"}'::jsonb, 'create_payroll_run') ->> 'id')::uuid;
select pg_temp.expect((select status from public.payroll_runs where id = (select v from ids where k = 'run')) = 'draft', 'create_payroll_run: draft');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('payroll_runs', (select v from ids where k = 'run'), '{"status":"approved"}'::jsonb)$q$),
  'the AI cannot approve a payroll run');
select pg_temp.expect(pg_temp.fails($q$update public.payroll_runs set status = 'paid' where id = (select v from ids where k = 'run')$q$),
  'nor mark it paid directly');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('payroll_runs', null, '{"period_yyyy_mm":"2027-01","status":"approved"}'::jsonb)$q$),
  'nor create an approved run');
reset role;

------------------------------------------------------------
-- The audit log: every write, with before and after, salary and IBAN hidden
------------------------------------------------------------
select pg_temp.expect((select count(*) from public.audit_log where operation = 'MCP_WRITE') >= 25, 'every AI write is in the audit log');
select pg_temp.expect((select count(*) from public.audit_log where operation = 'MCP_WRITE' and new_data ->> 'tool' = 'update_account'
  and coalesce(old_data ->> 'city', '') = '' and new_data -> 'after' ->> 'city' = 'Dubai' and 'city' = any (changed_fields)) = 1, 'the log has before and after');
select pg_temp.expect((select actor_email from public.audit_log where operation = 'MCP_WRITE' order by id desc limit 1)
  = 'ai-assistant@redreach.ae (AI key: AI Assistant)', 'writes are attributed to the AI Assistant and the key');
select pg_temp.expect((select count(*) from public.audit_log where operation = 'MCP_WRITE' and new_data ->> 'tool' = 'update_employee'
  and new_data -> 'after' ->> 'basic_salary_aed' = '[hidden]' and new_data -> 'after' ->> 'iban' = '[hidden]'
  and new_data -> 'args' ->> 'iban' = '[hidden]') = 1, 'salary and IBAN are hidden in the log');

------------------------------------------------------------
-- People are not affected
------------------------------------------------------------
select pg_temp.logout();
select pg_temp.login('admin');
update public.invoices set notes = 'edited by a person' where id = (select v from ids where k = 'invoice');
select pg_temp.expect((select notes from public.invoices where id = (select v from ids where k = 'invoice')) = 'edited by a person',
  'a person can still edit a sent invoice');
reset role;

rollback;
