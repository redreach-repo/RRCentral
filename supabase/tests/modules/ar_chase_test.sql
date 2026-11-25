-- Overdue invoice chasing (20261328090000_ar_chase.sql). One access check per role,
-- the stamps, the rules, and what an AI connector key may do.
begin;
\ir _fixtures.sql

-- The four overdue invoices from the brief (AED 114,232.50 in all).
insert into public.invoices (id, client, reference_number, date, amount, status, payment_status, payment_terms, tenant_id) values
  ('e8000000-0000-4000-8000-000000000102', 'Mass Allied Freighters', 'RR-03-26102', '2026-09-01', 37500.00, 'Sent', 'Pending', 'Net 30', 'a0000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000103', 'Arabian Sky Business Center', 'RR-03-26103', '2026-09-30', 1732.50, 'Sent', 'Pending', 'Net 30', 'a0000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000104', 'Mass Allied Freighters', 'RR-03-26104', '2026-09-15', 37500.00, 'Sent', 'Pending', 'Net 30', 'a0000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000105', 'Mass Allied Freighters', 'RR-03-26105', '2026-09-15', 37500.00, 'Sent', 'Pending', 'Net 30', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

select pg_temp.expect(
  (select sum(amount) from public.invoices where reference_number in ('RR-03-26102', 'RR-03-26103', 'RR-03-26104', 'RR-03-26105')) = 114232.50,
  'the four test invoices total AED 114,232.50');

------------------------------------------------------------
-- sales: log a chase, make and work a task
------------------------------------------------------------
select pg_temp.login('sales');
insert into public.invoice_chase_log (id, invoice_id, chased_on, channel, contact, note, promised_date, tenant_id, created_by_email, source)
values ('e8100000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000102', current_date, 'call', 'Accounts team',
        'Promised to pay by transfer', current_date + 3, 'b0000000-0000-4000-8000-000000000001', 'forged@example.com', 'ai');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 1, 'sales can log a chase');
select pg_temp.expect(
  (select tenant_id from public.invoice_chase_log where id = 'e8100000-0000-4000-8000-000000000001') = 'a0000000-0000-4000-8000-000000000001',
  'the chase takes the invoice tenant, whatever was sent');
select pg_temp.expect(
  (select created_by_email from public.invoice_chase_log where id = 'e8100000-0000-4000-8000-000000000001') = 'mt-sales@redreach.ae',
  'who logged it comes from the session, not the request');
select pg_temp.expect(
  (select source from public.invoice_chase_log where id = 'e8100000-0000-4000-8000-000000000001') = 'app',
  'a person''s chase is marked app');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000102', 'fax', 'x')$q$),
  'only email, call, WhatsApp or visit');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note, chased_on, promised_date)
  values ('e8000000-0000-4000-8000-000000000102', 'email', 'x', current_date, current_date - 1)$q$),
  'a promised date cannot be before the chase');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note, chased_on)
  values ('e8000000-0000-4000-8000-000000000102', 'email', 'x', current_date + 10)$q$),
  'a chase cannot be dated in the future');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000102', 'email', '  ')$q$),
  'a chase needs a note or a promised date');
update public.invoice_chase_log set note = 'changed by sales';
delete from public.invoice_chase_log;

insert into public.invoice_chase_tasks (id, invoice_id, step_day, kind, due_on)
values ('e8200000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000102', 45, 'escalate', current_date);
select pg_temp.expect((select count(*) from public.invoice_chase_tasks) = 1, 'sales can add the task for a step');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_tasks (invoice_id, step_day, kind, due_on)
  values ('e8000000-0000-4000-8000-000000000102', 45, 'escalate', current_date)$q$),
  'one task per invoice and step');
update public.invoice_chase_tasks set status = 'done', outcome = 'Called the owner', step_day = 1, kind = 'reminder'
where id = 'e8200000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select done_by_email = 'mt-sales@redreach.ae' and done_at is not null and step_day = 45 and kind = 'escalate'
   from public.invoice_chase_tasks where id = 'e8200000-0000-4000-8000-000000000001'),
  'finishing a task records who and when, and the step stays as it was');
delete from public.invoice_chase_tasks;

select pg_temp.expect(pg_temp.fails($q$insert into public.ar_chase_settings (reminder_days, escalate_days) values ('{2,9}', 40)$q$),
  'sales cannot set the chase schedule');
reset role;

select pg_temp.expect(
  (select note from public.invoice_chase_log where id = 'e8100000-0000-4000-8000-000000000001') = 'Promised to pay by transfer',
  'sales cannot change a chase note');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 1, 'sales cannot remove a chase note');
select pg_temp.expect((select count(*) from public.invoice_chase_tasks) = 1, 'sales cannot remove a task');

------------------------------------------------------------
-- manager and admin
------------------------------------------------------------
select pg_temp.login('manager');
insert into public.ar_chase_settings (reminder_days, escalate_days) values ('{1,7,14,30}', 45);
select pg_temp.expect((select count(*) from public.ar_chase_settings) = 1, 'manager can set the chase schedule');
update public.ar_chase_settings set escalate_days = 50;
select pg_temp.expect((select escalate_days from public.ar_chase_settings) = 50, 'manager can change the schedule');
select pg_temp.expect(pg_temp.fails($q$update public.ar_chase_settings set reminder_days = '{0,7}'$q$), 'reminder days are 1 to 365');
select pg_temp.expect(pg_temp.fails($q$update public.ar_chase_settings set reminder_days = '{}'$q$), 'at least one reminder day');
update public.invoice_chase_log set note = 'Promised to pay by transfer (confirmed)', created_by_email = 'someone@else'
where id = 'e8100000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select note = 'Promised to pay by transfer (confirmed)' and created_by_email = 'mt-sales@redreach.ae'
   from public.invoice_chase_log where id = 'e8100000-0000-4000-8000-000000000001'),
  'manager can correct a note; who logged it stays');
reset role;

select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 1, 'admin reads the chase log');
select pg_temp.expect((select count(*) from public.invoice_chase_tasks) = 1, 'admin reads chase tasks');
update public.ar_chase_settings set escalate_days = 45;
select pg_temp.expect((select escalate_days from public.ar_chase_settings) = 45, 'admin can change the schedule');
reset role;

------------------------------------------------------------
-- viewer: read only
------------------------------------------------------------
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 1, 'viewer reads the chase log');
select pg_temp.expect((select count(*) from public.invoice_chase_tasks) = 1, 'viewer reads chase tasks');
select pg_temp.expect((select count(*) from public.ar_chase_settings) = 1, 'viewer reads the schedule');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000103', 'email', 'viewer')$q$),
  'viewer cannot log a chase');
update public.invoice_chase_tasks set status = 'skipped';
reset role;
select pg_temp.expect((select status from public.invoice_chase_tasks limit 1) = 'done', 'viewer cannot work tasks');

------------------------------------------------------------
-- staff role, strangers and other tenants: nothing
------------------------------------------------------------
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 0, 'staff role cannot read the chase log');
select pg_temp.expect((select count(*) from public.invoice_chase_tasks) = 0, 'staff role cannot read chase tasks');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000103', 'email', 'staff')$q$),
  'staff role cannot log a chase');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 0, 'stranger sees no chase log');
select pg_temp.expect((select count(*) from public.ar_chase_settings) = 0, 'stranger sees no schedule');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 0, 'tenant B cannot see tenant A chases');
select pg_temp.expect((select count(*) from public.invoice_chase_tasks) = 0, 'tenant B cannot see tenant A tasks');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000103', 'email', 'from B')$q$),
  'tenant B cannot log a chase on a tenant A invoice');
reset role;

------------------------------------------------------------
-- AI connector: a standard (sales) key
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
select 'e8900000-0000-4000-8000-000000000001', 'Chase test key', 'hmk_chas', repeat('9', 64), 'sales', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'mt-sales@redreach.ae';
reset role;

select pg_temp.login_mcp('sales', 'e8900000-0000-4000-8000-000000000001');
insert into public.invoice_chase_log (id, invoice_id, channel, contact, note)
values ('e8100000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000103', 'email', 'Reception', 'Sent the statement again');
select pg_temp.expect(
  (select source from public.invoice_chase_log where id = 'e8100000-0000-4000-8000-000000000002') = 'ai',
  'an AI key can log a chase, marked ai');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_tasks (invoice_id, step_day, kind, due_on)
  values ('e8000000-0000-4000-8000-000000000103', 7, 'reminder', current_date)$q$),
  'an AI key cannot add chase tasks');
update public.invoice_chase_tasks set status = 'open';
select pg_temp.expect((select status from public.invoice_chase_tasks limit 1) = 'open', 'an AI key can work a chase task');
update public.ar_chase_settings set escalate_days = 10;
delete from public.invoice_chase_log;
reset role;
select pg_temp.logout();
select pg_temp.expect((select escalate_days from public.ar_chase_settings) = 45, 'an AI key cannot change the schedule');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 2, 'an AI key cannot remove chase notes');

------------------------------------------------------------
-- AI connector: keys with departments follow invoices
------------------------------------------------------------
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
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.login('admin');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, assistant, departments, acts_as_user_id, created_by)
select v.id::uuid, v.name, 'hmk_chd', v.hash, 'admin', 'admin', 'grok', v.depts::text[], u.id, 'mt-admin@redreach.ae'
from public.app_users u,
  (values ('e8910000-0000-4000-8000-000000000001', 'Chase finance', repeat('7', 64), '{finance}'),
          ('e8910000-0000-4000-8000-000000000002', 'Chase sales', repeat('6', 64), '{sales}'),
          ('e8910000-0000-4000-8000-000000000003', 'Chase HR', repeat('5', 64), '{hr}')
  ) as v(id, name, hash, depts)
where u.email = 'ai-assistant@redreach.ae';
reset role;

select pg_temp.login_ai('e8910000-0000-4000-8000-000000000001');
insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000104', 'call', 'Finance key chase');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 3, 'a finance key reads and logs chases');
select pg_temp.expect(pg_temp.fails($q$update public.ar_chase_settings set escalate_days = 11$q$), 'a finance key is refused when changing the schedule');
reset role;
select pg_temp.logout();
select pg_temp.expect((select escalate_days from public.ar_chase_settings) = 45, 'a finance key cannot change the schedule');

select pg_temp.login_ai('e8910000-0000-4000-8000-000000000002');
insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000105', 'visit', 'Sales key chase');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 4, 'a sales key reads and logs chases (it reads invoices)');
reset role;
select pg_temp.logout();

select pg_temp.login_ai('e8910000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) from public.invoice_chase_log) = 0, 'an HR key cannot read chases');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.invoice_chase_log (invoice_id, channel, note) values ('e8000000-0000-4000-8000-000000000105', 'call', 'HR key')$q$),
  'an HR key cannot log chases');
reset role;
select pg_temp.logout();

rollback;
