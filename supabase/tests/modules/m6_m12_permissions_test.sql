-- Permission fix for the M6–M12 slices: role access + four eyes (docs/modules/m6-m12-permissions.md).
begin;
\ir _fixtures.sql

insert into public.hr_employees (id, full_name) values ('e0000000-0000-4000-8000-000000000001', 'Test Person');
insert into public.payroll_runs (id, period_yyyy_mm) values ('e0000000-0000-4000-8000-000000000002', '2026-11');
insert into public.api_keys (id, name, key_prefix, key_hash) values ('e0000000-0000-4000-8000-000000000003', 'k', 'hm_x', repeat('a', 64));
insert into public.webhook_endpoints (id, url, secret) values ('e0000000-0000-4000-8000-000000000004', 'https://x.example.com', 'whsec_x');

-- HR / payroll: manager and admin only
select pg_temp.login('sales');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'sales cannot read employees (salaries, IBANs)');
select pg_temp.expect((select count(*) from public.payroll_runs) = 0, 'sales cannot read payroll runs');
select pg_temp.expect(pg_temp.fails($q$insert into public.hr_employees (full_name) values ('x')$q$), 'sales cannot add employees');
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'staff cannot read employees');
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.payroll_lines) = 0, 'viewer cannot read payroll lines');
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.hr_employees) = 1, 'manager reads employees');
select pg_temp.expect(not pg_temp.fails($q$update public.payroll_runs set status = status where id = 'e0000000-0000-4000-8000-000000000002'$q$), 'manager edits payroll');
select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.payroll_runs) = 1, 'admin reads payroll');

-- API keys + webhooks: admin only
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.api_keys) = 0, 'manager cannot read API keys');
select pg_temp.expect((select count(*) from public.webhook_endpoints) = 0, 'manager cannot read webhook secrets');
select pg_temp.login('sales');
select pg_temp.expect(pg_temp.fails($q$insert into public.api_keys (name, key_prefix, key_hash) values ('mine', 'hm_y', repeat('b', 64))$q$), 'sales cannot mint an API key');
select pg_temp.expect(pg_temp.fails($q$insert into public.webhook_endpoints (url, secret) values ('https://evil.example.com', 's')$q$), 'sales cannot add a webhook');
select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.api_keys) = 1, 'admin reads API keys');
select pg_temp.expect(not pg_temp.fails($q$update public.api_keys set revoked_at = now() where id = 'e0000000-0000-4000-8000-000000000003'$q$), 'admin revokes a key');

-- Approvals: asker forced, four eyes, final decisions
select pg_temp.login('manager');
insert into public.approval_requests (id, object_type, object_id, action, amount_aed, requested_by, status)
values ('e0000000-0000-4000-8000-0000000000a1', 'payroll_run', 'e0000000-0000-4000-8000-000000000002', 'approve', 42000,
        (select id from public.app_users where email = 'mt-admin@redreach.ae'), 'approved');
select pg_temp.expect(
  (select status = 'pending' and requested_by = (select id from public.app_users where email = 'mt-manager@redreach.ae')
   from public.approval_requests where id = 'e0000000-0000-4000-8000-0000000000a1'),
  'asker and pending status cannot be forged on insert');
select pg_temp.expect(pg_temp.fails($q$update public.approval_requests set status = 'approved' where id = 'e0000000-0000-4000-8000-0000000000a1'$q$), 'manager cannot approve own request');
select pg_temp.expect(pg_temp.fails($q$update public.approval_requests set amount_aed = 1 where id = 'e0000000-0000-4000-8000-0000000000a1'$q$), 'amount cannot be changed after asking');
select pg_temp.login('sales');
select pg_temp.expect((select count(*) from public.approval_requests) = 1, 'sales sees the queue');
update public.approval_requests set status = 'approved' where id = 'e0000000-0000-4000-8000-0000000000a1';
select pg_temp.expect(
  (select status from public.approval_requests where id = 'e0000000-0000-4000-8000-0000000000a1') = 'pending',
  'sales cannot approve (update matches no row)');
select pg_temp.login('viewer');
select pg_temp.expect(pg_temp.fails($q$insert into public.approval_requests (object_type, object_id, action) values ('x', '1', 'y')$q$), 'viewer cannot raise');
select pg_temp.login('admin');
select pg_temp.expect(pg_temp.fails($q$update public.approval_requests set decided_by = null, decided_at = now() where id = 'e0000000-0000-4000-8000-0000000000a1'$q$), 'decision fields only via status');
update public.approval_requests set status = 'approved', decided_by = (select id from public.app_users where email = 'mt-sales@redreach.ae'), decision_note = 'ok'
where id = 'e0000000-0000-4000-8000-0000000000a1';
select pg_temp.expect(
  (select status = 'approved' and decided_by = (select id from public.app_users where email = 'mt-admin@redreach.ae') and decided_at is not null
   from public.approval_requests where id = 'e0000000-0000-4000-8000-0000000000a1'),
  'admin approves; checker recorded as the real signed in user');
select pg_temp.expect(pg_temp.fails($q$update public.approval_requests set status = 'rejected', decision_note = 'x' where id = 'e0000000-0000-4000-8000-0000000000a1'$q$), 'decided request is final');
select pg_temp.expect(pg_temp.fails($q$update public.approval_requests set decision_note = 'changed' where id = 'e0000000-0000-4000-8000-0000000000a1'$q$), 'decision note cannot be rewritten later');

-- Cancel: asker or admin
select pg_temp.login('staff');
insert into public.approval_requests (id, object_type, object_id, action) values ('e0000000-0000-4000-8000-0000000000a2', 'expense', 'x1', 'approve');
select pg_temp.expect((select count(*) from public.approval_requests) = 1, 'staff sees only own requests');
select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$update public.approval_requests set status = 'canceled' where id = 'e0000000-0000-4000-8000-0000000000a2'$q$), 'manager cannot cancel someone else''s request');
select pg_temp.login('staff');
update public.approval_requests set status = 'canceled' where id = 'e0000000-0000-4000-8000-0000000000a2';
select pg_temp.expect((select status from public.approval_requests where id = 'e0000000-0000-4000-8000-0000000000a2') = 'canceled', 'asker cancels own request');

-- Other tenant + anon
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.approval_requests) = 0, 'tenant B sees no tenant A approvals');
select pg_temp.expect((select count(*) from public.hr_employees) = 0, 'tenant B sees no tenant A employees');
select pg_temp.expect((select count(*) from public.api_keys) = 0, 'tenant B sees no tenant A keys');
reset role;
set local role anon;
select pg_temp.expect(pg_temp.fails('select 1 from public.hr_employees'), 'anon cannot read employees');
reset role;

rollback;
