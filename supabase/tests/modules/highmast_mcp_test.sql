-- HighMast MCP server (AI connector keys): what a key can and cannot do in the database.
--   * only admins manage keys; a key can only act as a sales, staff or viewer member with that role
--   * rr_mcp_resolve_key: right key in, wrong or revoked key out, 60 calls a minute
--   * an AI session (sales key) cannot read HR, payroll, settings, keys or the audit log
--   * an AI session cannot delete anything, and can only write leads, notes, follow-ups and stages
--   * every tool call lands in audit_log with the key name
begin;
\ir _fixtures.sql

-- An AI session: the member's login plus the hm_mcp_key claim the function puts in its token.
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

-- Data to try to reach.
insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values ('e5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'MCP-1', 'Hidden Person', 'active')
on conflict do nothing;
insert into public.payroll_runs (id, tenant_id, period_yyyy_mm)
values ('e5100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026-11')
on conflict do nothing;
insert into public.payroll_lines (id, tenant_id, run_id, employee_id)
values ('e5200000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'e5100000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.crm (id, company_name, pipeline_stage, next_action, follow_up_date)
values ('e5300000-0000-4000-8000-000000000001', 'MCP Test Co', 'Lead', 'Call', current_date)
on conflict do nothing;
insert into public.accounts (id, type, name, status)
values ('e5400000-0000-4000-8000-000000000001', 'ai_crm_client', 'MCP Account', 'prospect')
on conflict do nothing;
insert into public.quotations (id, client, reference_number, amount, status)
values ('e5500000-0000-4000-8000-000000000001', 'MCP Account', 'RR-MCP-Q1', 100, 'Draft')
on conflict do nothing;
insert into public.invoices (id, client, reference_number, amount, status)
values ('e5600000-0000-4000-8000-000000000001', 'MCP Account', 'RR-MCP-I1', 100, 'Sent')
on conflict do nothing;

------------------------------------------------------------
-- Keys: admin only, role must match the member
------------------------------------------------------------
select pg_temp.login('admin');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, acts_as_user_id, created_by)
select 'e5900000-0000-4000-8000-000000000001', 'Grok Bot', 'hmk_aaaa', repeat('a', 64), 'sales', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'mt-sales@redreach.ae';
select pg_temp.expect((select count(*) from public.mcp_keys where id = 'e5900000-0000-4000-8000-000000000001') = 1, 'admin creates a sales key');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, acts_as_user_id)
  select 'Bad', repeat('b', 64), 'sales', u.id from public.app_users u where u.email = 'mt-admin@redreach.ae'$q$),
  'a key cannot act as an admin member');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.mcp_keys (name, key_hash, role, acts_as_user_id)
  select 'Bad', repeat('c', 64), 'manager', u.id from public.app_users u where u.email = 'mt-manager@redreach.ae'$q$),
  'no manager keys');
select pg_temp.expect(pg_temp.fails($q$
  delete from public.mcp_keys where id = 'e5900000-0000-4000-8000-000000000001'$q$),
  'keys are never deleted, only revoked');
reset role;
select pg_temp.logout();

do $$
declare
  who text;
begin
  foreach who in array array['manager', 'sales', 'staff', 'viewer']
  loop
    perform pg_temp.login(who);
    perform pg_temp.expect((select count(*) from public.mcp_keys) = 0, who || ' cannot see AI keys');
    perform pg_temp.expect(pg_temp.fails($q$
      insert into public.mcp_keys (name, key_hash, role, acts_as_user_id)
      select 'Mine', repeat('d', 64), 'sales', u.id from public.app_users u where u.email = 'mt-sales@redreach.ae'$q$),
      who || ' cannot create AI keys');
    reset role;
  end loop;
end $$;
select pg_temp.logout();

------------------------------------------------------------
-- Resolving a key (the function calls this with the public key)
------------------------------------------------------------
set local role anon;
select pg_temp.expect((select count(*) from public.rr_mcp_resolve_key(repeat('a', 64))) = 1, 'the right key resolves');
select pg_temp.expect((select role from public.rr_mcp_resolve_key(repeat('a', 64))) = 'sales', 'the key acts as sales');
select pg_temp.expect((select auth_user_id from public.rr_mcp_resolve_key(repeat('a', 64))) = '00000000-0000-0000-0000-0000000001a3', 'the key acts as the sales login');
select pg_temp.expect((select count(*) from public.rr_mcp_resolve_key(repeat('f', 64))) = 0, 'a wrong key does not resolve');
select pg_temp.expect((select count(*) from public.rr_mcp_resolve_key('not-a-hash')) = 0, 'garbage does not resolve');
select pg_temp.expect(pg_temp.fails('select * from public.mcp_keys'), 'the public key cannot read the keys table');
reset role;

-- 60 calls a minute: three used above, use up the rest, the next is refused.
update public.mcp_keys set rate_window_start = date_trunc('minute', now()), rate_count = 59
where id = 'e5900000-0000-4000-8000-000000000001';
select pg_temp.expect((select allowed from public.rr_mcp_resolve_key(repeat('a', 64))), 'call 60 in the minute is allowed');
select pg_temp.expect(not (select allowed from public.rr_mcp_resolve_key(repeat('a', 64))), 'call 61 in the minute is refused');
update public.mcp_keys set rate_window_start = date_trunc('minute', now()) - interval '1 minute'
where id = 'e5900000-0000-4000-8000-000000000001';
select pg_temp.expect((select allowed from public.rr_mcp_resolve_key(repeat('a', 64))), 'a new minute starts a new count');

-- A member promoted away from the key's role, or switched off, stops the key.
update public.app_users set role = 'admin' where email = 'mt-sales@redreach.ae';
select pg_temp.expect((select count(*) from public.rr_mcp_resolve_key(repeat('a', 64))) = 0, 'a key stops when its member becomes admin');
update public.app_users set role = 'sales', active = false where email = 'mt-sales@redreach.ae';
select pg_temp.expect((select count(*) from public.rr_mcp_resolve_key(repeat('a', 64))) = 0, 'a key stops when its member is switched off');
update public.app_users set active = true where email = 'mt-sales@redreach.ae';

------------------------------------------------------------
-- A sales AI session: no HR, payroll, settings, keys or audit
------------------------------------------------------------
select pg_temp.login_mcp('sales', 'e5900000-0000-4000-8000-000000000001');
select pg_temp.expect(public.rr_mcp_key_id() = 'e5900000-0000-4000-8000-000000000001', 'the session carries its key');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'sales AI key cannot read HR people');
select pg_temp.expect((select count(*) from public.payroll_runs) = 0, 'sales AI key cannot read payroll runs');
select pg_temp.expect((select count(*) from public.payroll_lines) = 0, 'sales AI key cannot read payroll lines (salaries, IBAN)');
select pg_temp.expect((select count(*) from public.app_settings) = 0, 'sales AI key cannot read settings');
select pg_temp.expect((select count(*) from public.mcp_keys) = 0, 'sales AI key cannot read keys');
select pg_temp.expect((select count(*) from public.crm where id = 'e5300000-0000-4000-8000-000000000001') = 1, 'sales AI key reads CRM leads');
select pg_temp.expect((select count(*) from public.quotations where id = 'e5500000-0000-4000-8000-000000000001') = 1, 'sales AI key reads quotations');

-- Nothing can be deleted: the rows are simply out of reach for delete.
delete from public.crm where id = 'e5300000-0000-4000-8000-000000000001';
delete from public.accounts where id = 'e5400000-0000-4000-8000-000000000001';
delete from public.quotations where id = 'e5500000-0000-4000-8000-000000000001';
delete from public.invoices where id = 'e5600000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect((select count(*) from public.crm where id = 'e5300000-0000-4000-8000-000000000001') = 1, 'sales AI key cannot delete a CRM lead');
select pg_temp.expect((select count(*) from public.accounts where id = 'e5400000-0000-4000-8000-000000000001') = 1, 'sales AI key cannot delete an account');
select pg_temp.expect((select count(*) from public.quotations where id = 'e5500000-0000-4000-8000-000000000001') = 1, 'sales AI key cannot delete a quotation');
select pg_temp.expect((select count(*) from public.invoices where id = 'e5600000-0000-4000-8000-000000000001') = 1, 'sales AI key cannot delete an invoice');
do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
        and p.policyname = 'MCP never deletes' and p.permissive = 'RESTRICTIVE' and p.cmd = 'DELETE'
    );
  perform pg_temp.expect(bad is null, 'every table blocks deletes from AI keys (missing: ' || coalesce(bad, 'none') || ')');
end $$;

-- Quotes, invoices and payments stay read only; leads, notes and stages can be written.
select pg_temp.login_mcp('sales', 'e5900000-0000-4000-8000-000000000001');
select pg_temp.expect(pg_temp.fails($q$insert into public.quotations (client, reference_number) values ('X', 'RR-MCP-Q2')$q$), 'sales AI key cannot add a quotation');
select pg_temp.expect(pg_temp.fails($q$insert into public.invoices (client, reference_number) values ('X', 'RR-MCP-I2')$q$), 'sales AI key cannot add an invoice');
update public.invoices set payment_status = 'Paid' where id = 'e5600000-0000-4000-8000-000000000001';
update public.quotations set amount = 1 where id = 'e5500000-0000-4000-8000-000000000001';
select pg_temp.expect(pg_temp.fails($q$insert into public.hr_employees (tenant_id, employee_code, full_name, employment_status)
  values ('a0000000-0000-4000-8000-000000000001', 'MCP-X', 'Sneaky', 'active')$q$), 'sales AI key cannot add HR people');
insert into public.crm (company_name, pipeline_stage) values ('New AI Lead', 'Lead');
insert into public.account_activities (account_id, kind, body) values ('e5400000-0000-4000-8000-000000000001', 'note', 'AI note');
update public.crm set pipeline_stage = 'Contacted' where id = 'e5300000-0000-4000-8000-000000000001';
select public.rr_mcp_log_call('list_deals', '{"pipeline":"company"}'::jsonb, true, '');
reset role;
select pg_temp.expect((select payment_status from public.invoices where id = 'e5600000-0000-4000-8000-000000000001') <> 'Paid', 'sales AI key cannot change an invoice');
select pg_temp.expect((select amount from public.quotations where id = 'e5500000-0000-4000-8000-000000000001') = 100, 'sales AI key cannot change a quotation');
select pg_temp.expect((select count(*) from public.crm where company_name = 'New AI Lead') = 1, 'sales AI key adds a lead');
select pg_temp.expect((select count(*) from public.account_activities where body = 'AI note') = 1, 'sales AI key adds a timeline note');
select pg_temp.expect((select pipeline_stage from public.crm where id = 'e5300000-0000-4000-8000-000000000001') = 'Contacted', 'sales AI key moves a stage');
select pg_temp.expect((select count(*) from public.audit_log
  where table_name = 'mcp_tool_call' and operation = 'MCP_CALL' and new_data->>'key_name' = 'Grok Bot' and new_data->>'tool' = 'list_deals') = 1,
  'the tool call is in the audit log with the key name');

-- People are not affected, and only AI sessions can write call logs.
select pg_temp.logout();
select pg_temp.login('sales');
select pg_temp.expect(public.rr_mcp_key_id() is null, 'a person has no AI key');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_log_call('x', '{}'::jsonb, true, '')$q$), 'a person cannot write AI call logs');
select pg_temp.expect((select count(*) from public.crm where id = 'e5300000-0000-4000-8000-000000000001') = 1, 'a person still reads CRM');
reset role;

-- A revoked key stops at once.
select pg_temp.login('admin');
update public.mcp_keys set revoked_at = now() where id = 'e5900000-0000-4000-8000-000000000001';
reset role;
select pg_temp.logout();
set local role anon;
select pg_temp.expect((select count(*) from public.rr_mcp_resolve_key(repeat('a', 64))) = 0, 'a revoked key does not resolve');
reset role;
select pg_temp.login_mcp('sales', 'e5900000-0000-4000-8000-000000000001');
select pg_temp.expect(pg_temp.fails($q$select public.rr_mcp_log_call('x', '{}'::jsonb, true, '')$q$), 'a revoked key cannot log calls');
reset role;

rollback;
