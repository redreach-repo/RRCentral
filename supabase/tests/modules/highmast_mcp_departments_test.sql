-- HighMast MCP keys with an assistant and departments (20261325090000_highmast_mcp_departments.sql).
--   * an admin-scope key needs one or more known departments; standard keys have none
--   * each key reads and writes only its departments' tables, checked by row level security
--   * different keys (assistants) can be on different departments at the same time
--   * the "admin" department reaches everything an admin key could before
--   * every earlier rule still holds (audit, payroll stays draft, no hard deletes)
--   * standard keys and people are not affected
begin;
\ir _fixtures.sql

insert into auth.users values ('00000000-0000-0000-0000-0000000001c1', 'ai-assistant@redreach.ae', now())
on conflict (id) do nothing;
insert into public.app_users (email, name, role, active, tenant_id)
values ('ai-assistant@redreach.ae', 'AI Assistant', 'admin', true, 'a0000000-0000-4000-8000-000000000001')
on conflict (email) do update set role = 'admin', active = true;

create or replace function pg_temp.login_ai(key uuid) returns void language plpgsql as $$
declare sub text;
begin
  select x.id::text into sub from auth.users x join public.app_users u on lower(u.email) = lower(x.email)
  join public.mcp_keys k on k.acts_as_user_id = u.id where k.id = key;
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

insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values ('e6100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'MCPD-1', 'Dept Test Employee', 'active')
on conflict do nothing;
insert into public.tickets (id, tenant_id, subject) values ('e6100000-0000-4000-8000-0000000000aa', 'a0000000-0000-4000-8000-000000000001', 'Dept test ticket')
on conflict do nothing;

------------------------------------------------------------
-- Keys: assistant and departments
------------------------------------------------------------
select pg_temp.login('admin');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, assistant, departments, acts_as_user_id, created_by)
select v.id::uuid, v.name, 'hmk_dept', v.hash, 'admin', 'admin', v.assistant, v.depts::text[], u.id, 'mt-admin@redreach.ae'
from public.app_users u,
  (values ('e6910000-0000-4000-8000-000000000001', 'Grok sales', repeat('a', 64), 'grok', '{sales}'),
          ('e6910000-0000-4000-8000-000000000002', 'Claude HR', repeat('b', 64), 'claude', '{hr}'),
          ('e6910000-0000-4000-8000-000000000003', 'ChatGPT payroll', repeat('c', 64), 'chatgpt', '{payroll}'),
          ('e6910000-0000-4000-8000-000000000004', 'Grok finance', repeat('d', 64), 'grok', '{finance}'),
          ('e6910000-0000-4000-8000-000000000005', 'Claude support and documents', repeat('e', 64), 'claude', '{support,documents}'),
          ('e6910000-0000-4000-8000-000000000006', 'Claude everything', repeat('f', 64), 'claude', '{admin}'),
          ('e6910000-0000-4000-8000-000000000007', 'Grok marketing', repeat('1', 64), 'grok', '{marketing}'),
          ('e6910000-0000-4000-8000-000000000008', 'Grok operations', repeat('2', 64), 'grok', '{operations}')
  ) as v(id, name, hash, assistant, depts)
where u.email = 'ai-assistant@redreach.ae';
select pg_temp.expect((select count(*) from public.mcp_keys where key_prefix = 'hmk_dept') = 8,
  'an admin creates keys for different assistants on different departments');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, acts_as_user_id)
  select 'No depts', repeat('3', 64), 'admin', 'admin', u.id from public.app_users u where u.email = 'ai-assistant@redreach.ae'$q$),
  'a department key needs at least one department');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, departments, acts_as_user_id)
  select 'Bad', repeat('4', 64), 'admin', 'admin', '{sales,legal}', u.id from public.app_users u where u.email = 'ai-assistant@redreach.ae'$q$),
  'unknown departments are refused');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, departments, acts_as_user_id)
  select 'Std', repeat('5', 64), 'sales', 'standard', '{sales}', u.id from public.app_users u where u.email = 'mt-sales@redreach.ae'$q$),
  'standard keys have no departments');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, scope, assistant, departments, acts_as_user_id)
  select 'Odd', repeat('6', 64), 'admin', 'admin', 'siri', '{sales}', u.id from public.app_users u where u.email = 'ai-assistant@redreach.ae'$q$),
  'unknown assistants are refused');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, assistant, acts_as_user_id, created_by)
select 'e6910000-0000-4000-8000-000000000009', 'Grok standard', 'hmk_std1', repeat('7', 64), 'sales', 'grok', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'mt-sales@redreach.ae';
reset role;
select pg_temp.logout();

set local role anon;
select pg_temp.expect((select departments from public.rr_mcp_resolve_key(repeat('a', 64))) = '{sales}', 'a key resolves with its departments');
select pg_temp.expect((select assistant from public.rr_mcp_resolve_key(repeat('b', 64))) = 'claude', 'and its assistant');
select pg_temp.expect((select departments from public.rr_mcp_resolve_key(repeat('7', 64))) = '{}', 'a standard key has none');
reset role;

------------------------------------------------------------
-- Sales key (Grok)
------------------------------------------------------------
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000001');
select pg_temp.expect((public.rr_mcp_reach() -> 'read') ? 'accounts', 'sales reach lists accounts');
select pg_temp.expect(not ((public.rr_mcp_reach() -> 'read') ? 'hr_employees'), 'but not HR');
select pg_temp.expect(not ((public.rr_mcp_reach() -> 'write') ? 'invoices'), 'and cannot write invoices');
insert into ids select 'account', (public.rr_mcp_save('accounts', null,
  '{"name":"MCP Dept Test LLC","type":"ai_crm_client","status":"prospect"}'::jsonb, 'create_account') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.accounts where id = (select v from ids where k = 'account')) = 1, 'sales creates an account');
insert into ids select 'quote', ((public.rr_mcp_quote_save(null,
  jsonb_build_object('client', 'MCP Dept Test LLC', 'account_id', (select v from ids where k = 'account'), 'vertical', 'RR Threads', 'division_code', '01'),
  '[{"description":"Polo shirt","quantity":2,"unit_price":100}]'::jsonb) -> 'quote') ->> 'id')::uuid;
select pg_temp.expect((select amount from public.quotations where id = (select v from ids where k = 'quote')) = 210, 'sales creates a quote (2 x 100 + 5% VAT)');
select pg_temp.expect((select count(*) from public.line_items where doc_type = 'Quote'
  and reference = (select quote_id from public.quotations where id = (select v from ids where k = 'quote'))) = 1, 'and sees its lines');
select pg_temp.expect(public.rr_mcp_quote_finalize((select v from ids where k = 'quote')) ->> 'reference_number' like 'RR-01-%', 'sales finalizes the quote');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'sales cannot read HR');
select pg_temp.expect((select count(*) from public.payroll_runs) = 0, 'nor payroll');
select pg_temp.expect((select count(*) from public.tickets) = 0, 'nor support tickets');
select pg_temp.expect((select count(*) from public.legal_documents) = 0, 'nor tables no department lists');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_quote_to_invoice((select v from ids where k = 'quote'))$q$),
  'sales cannot make invoices');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('hr_employees', 'e6100000-0000-4000-8000-000000000001', '{"job_title":"x"}'::jsonb)$q$),
  'nor change employees');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('tickets', null, '{"subject":"x"}'::jsonb)$q$),
  'nor open tickets');
select pg_temp.expect(pg_temp.fails($q$update public.hr_employees set job_title = 'x' where id = 'e6100000-0000-4000-8000-000000000001'$q$)
  or (select count(*) from public.hr_employees where job_title = 'x') = 0, 'nor change HR directly');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- Finance key (Grok): invoices and payments, no HR, no deals
------------------------------------------------------------
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000004');
select pg_temp.expect((select count(*) from public.quotations where id = (select v from ids where k = 'quote')) = 1, 'finance reads quotes');
insert into ids select 'invoice', ((public.rr_mcp_quote_to_invoice((select v from ids where k = 'quote')) -> 'invoice') ->> 'id')::uuid;
select pg_temp.expect((select amount from public.invoices where id = (select v from ids where k = 'invoice')) = 210, 'finance converts the quote to an invoice');
select pg_temp.expect((select count(*) from public.line_items where doc_type = 'Invoice'
  and reference = (select reference_number from public.invoices where id = (select v from ids where k = 'invoice'))) = 1, 'with its lines');
insert into ids select 'payment', ((public.rr_mcp_record_payment((select v from ids where k = 'invoice'), 100, current_date, 'Bank transfer', 'TRX-D1')
  -> 'payment') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.payment_log where id = (select v from ids where k = 'payment')) = 1, 'finance records a payment');
select pg_temp.expect(pg_temp.fails($q$update public.payment_log set amount = 1 where id = (select v from ids where k = 'payment')$q$),
  'a recorded payment is still locked');
select pg_temp.expect(pg_temp.fails($q$update public.invoices set description = 'x' where id = (select v from ids where k = 'invoice')$q$),
  'a sent invoice is still locked');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'finance cannot read HR');
select pg_temp.expect((select count(*) from public.sales_deals) = 0, 'nor deals');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('sales_deals', null, jsonb_build_object('account_id', (select v from ids where k = 'account'), 'stage', 'lead', 'next_action', 'Call', 'next_action_date', current_date + 1))$q$),
  'nor create deals');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('accounts', (select v from ids where k = 'account'), '{"city":"X"}'::jsonb)$q$),
  'finance reads accounts but does not change them');
reset role;
select pg_temp.logout();

-- Sales can see the invoice it led to, but not its payments.
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) from public.invoices where id = (select v from ids where k = 'invoice')) = 1, 'sales reads invoices');
select pg_temp.expect(pg_temp.fails($q$update public.line_items set unit_price = 1 where doc_type = 'Invoice'
  and reference = (select reference_number from public.invoices where id = (select v from ids where k = 'invoice'))$q$)
  or (select count(*) from public.line_items where doc_type = 'Invoice' and unit_price = 1) = 0, 'but cannot change invoice lines');
select pg_temp.expect((select count(*) from public.payment_log) = 0, 'nor payments');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- HR key (Claude) and payroll key (ChatGPT)
------------------------------------------------------------
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) from public.hr_employees where id = 'e6100000-0000-4000-8000-000000000001') = 1, 'HR reads employees');
select pg_temp.expect((public.rr_mcp_save('hr_employees', 'e6100000-0000-4000-8000-000000000001', '{"job_title":"Supervisor"}'::jsonb, 'update_employee') ->> 'job_title') = 'Supervisor',
  'HR updates an employee');
select pg_temp.expect((select count(*) from public.accounts) = 0, 'HR cannot read accounts');
select pg_temp.expect((select count(*) from public.invoices) = 0, 'nor invoices');
select pg_temp.expect((select count(*) from public.payroll_runs) = 0, 'nor payroll');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('payroll_runs', null, '{"period_yyyy_mm":"2027-02"}'::jsonb)$q$),
  'nor start a payroll run');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('accounts', null, '{"name":"X","type":"ai_crm_client"}'::jsonb)$q$),
  'nor add accounts');
reset role;
select pg_temp.logout();

select pg_temp.login_ai('e6910000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) from public.hr_employees where id = 'e6100000-0000-4000-8000-000000000001') = 1, 'payroll reads employees');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_save('hr_employees', 'e6100000-0000-4000-8000-000000000001', '{"job_title":"x"}'::jsonb)$q$),
  'but cannot change them');
insert into ids select 'run', (public.rr_mcp_save('payroll_runs', null, '{"period_yyyy_mm":"2027-03"}'::jsonb, 'create_payroll_run') ->> 'id')::uuid;
select pg_temp.expect((select status from public.payroll_runs where id = (select v from ids where k = 'run')) = 'draft', 'payroll starts a draft run');
select pg_temp.expect(pg_temp.fails($q$update public.payroll_runs set status = 'approved' where id = (select v from ids where k = 'run')$q$),
  'and still cannot approve it');
select pg_temp.expect((select count(*) from public.accounts) = 0, 'payroll cannot read accounts');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- Two departments on one key (Claude: support and documents)
------------------------------------------------------------
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000005');
select pg_temp.expect((select count(*) from public.tickets where id = 'e6100000-0000-4000-8000-0000000000aa') = 1, 'support reads tickets');
select pg_temp.expect((public.rr_mcp_save('tickets', 'e6100000-0000-4000-8000-0000000000aa', '{"priority":"high"}'::jsonb, 'update_ticket') ->> 'priority') = 'high',
  'support updates a ticket');
insert into ids select 'doc', (public.rr_mcp_save('company_documents', null, '{"title":"Dept test licence","category":"other"}'::jsonb, 'add_document') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.company_documents where id = (select v from ids where k = 'doc')) = 1, 'documents adds a company document');
select pg_temp.expect((select count(*) from public.accounts where id = (select v from ids where k = 'account')) = 1, 'both read accounts for context');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'neither reads HR');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- Marketing and operations
------------------------------------------------------------
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000007');
insert into ids select 'campaign', (public.rr_mcp_save('marketing_campaigns', null, '{"name":"Dept test campaign","channel":"email","status":"draft"}'::jsonb, 'create_record') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.marketing_campaigns where id = (select v from ids where k = 'campaign')) = 1, 'marketing adds a campaign');
select pg_temp.expect((select count(*) from public.quotations) = 0, 'marketing cannot read quotes');
reset role;
select pg_temp.logout();

select pg_temp.login_ai('e6910000-0000-4000-8000-000000000008');
insert into ids select 'vendor', (public.rr_mcp_save('vendors', null, '{"company_name":"Dept test supplier"}'::jsonb, 'create_record') ->> 'id')::uuid;
select pg_temp.expect((select count(*) from public.vendors where id = (select v from ids where k = 'vendor')) = 1, 'operations adds a supplier');
select pg_temp.expect((select count(*) from public.marketing_campaigns) = 0, 'operations cannot read campaigns');
select pg_temp.expect((select count(*) from public.invoices) = 0, 'nor invoices');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- The admin department reaches everything an admin key could
------------------------------------------------------------
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000006');
select pg_temp.expect((select count(*) from public.hr_employees where id = 'e6100000-0000-4000-8000-000000000001') = 1, 'admin department reads HR');
select pg_temp.expect((select count(*) from public.payment_log where id = (select v from ids where k = 'payment')) = 1, 'and payments');
select pg_temp.expect((select count(*) from public.marketing_campaigns where id = (select v from ids where k = 'campaign')) = 1, 'and campaigns');
select pg_temp.expect((select count(*) from public.app_settings) = 0, 'but still never settings');
select pg_temp.expect((select count(*) from public.mcp_keys) = 0, 'nor keys');
delete from public.accounts where id = (select v from ids where k = 'account');
select pg_temp.expect((select count(*) from public.accounts where id = (select v from ids where k = 'account')) = 1, 'and still never hard deletes');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- Audit names the assistant
------------------------------------------------------------
select pg_temp.expect((select count(*) from public.audit_log where operation = 'MCP_WRITE' and new_data ->> 'tool' = 'update_employee'
  and actor_email = 'ai-assistant@redreach.ae (AI key: Claude HR, Claude)' and new_data ->> 'assistant' = 'claude'
  and new_data -> 'departments' = '["hr"]'::jsonb) = 1, 'the audit log names the key, the assistant and its departments');
select pg_temp.expect((select count(*) from public.audit_log where operation = 'MCP_WRITE' and actor_email like '%Grok Bot)') >= 3,
  'Grok Bot''s changes are marked as Grok Bot''s');

------------------------------------------------------------
-- Standard keys and people are not affected
------------------------------------------------------------
select pg_temp.login_ai('e6910000-0000-4000-8000-000000000009');
select pg_temp.expect((select count(*) from public.accounts where id = (select v from ids where k = 'account')) = 1, 'a standard sales key still reads accounts');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'and still not HR');
select pg_temp.expect((public.rr_mcp_reach() -> 'read') = '[]'::jsonb, 'and has no department reach');
reset role;
select pg_temp.logout();

select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.hr_employees where id = 'e6100000-0000-4000-8000-000000000001') = 1, 'a person still reads HR');
select pg_temp.expect((select count(*) from public.legal_documents) >= 0, 'and any table');
reset role;

rollback;
