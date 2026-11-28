-- Quote follow-up chasing (20261334090000_quote_chase.sql). One access check per role,
-- the Sales lock, the stamps, and what an AI connector key may do.
begin;
\ir _fixtures.sql

-- Green Cement RR-01-26008 (Sent) from the brief, a quote of the Sales user's
-- own client, and a quote in tenant B.
insert into public.quotations (id, client, reference_number, quote_id, status, valid_until, created_by, tenant_id) values
  ('f9000000-0000-4000-8000-000000000008', 'Green Cement', 'RR-01-26008', 'RR-01-26008', 'Sent', '2026-11-25', 'mt-manager@redreach.ae', 'a0000000-0000-4000-8000-000000000001'),
  ('f9000000-0000-4000-8000-000000000009', 'Sales Own Co', 'RR-01-26009', 'RR-01-26009', 'Sent', current_date + 10, 'mt-sales@redreach.ae', 'a0000000-0000-4000-8000-000000000001'),
  ('f9000000-0000-4000-8000-0000000000b1', 'Tenant B Co', 'RR-01-26901', 'RR-01-26901', 'Sent', current_date + 10, 'mt-admin@demo-b.test', 'b0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

------------------------------------------------------------
-- sales (with the finance.company switch from _fixtures): log, task
------------------------------------------------------------
select pg_temp.login('sales');
insert into public.quote_chase_log (id, quotation_id, chased_on, channel, contact, note, response, next_follow_up, tenant_id, created_by_email, source)
values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000008', current_date, 'call', 'Procurement',
        'Wants a revised price', 'needs_changes', current_date + 2, 'b0000000-0000-4000-8000-000000000001', 'forged@example.com', 'ai');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 1, 'sales can log a follow-up');
select pg_temp.expect(
  (select tenant_id from public.quote_chase_log where id = 'f9100000-0000-4000-8000-000000000001') = 'a0000000-0000-4000-8000-000000000001',
  'the follow-up takes the quote tenant, whatever was sent');
select pg_temp.expect(
  (select created_by_email from public.quote_chase_log where id = 'f9100000-0000-4000-8000-000000000001') = 'mt-sales@redreach.ae',
  'who logged it comes from the session, not the request');
select pg_temp.expect(
  (select source from public.quote_chase_log where id = 'f9100000-0000-4000-8000-000000000001') = 'app',
  'a person''s follow-up is marked app');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'fax', 'x')$q$),
  'only email, call, WhatsApp or visit');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note, response) values ('f9000000-0000-4000-8000-000000000008', 'call', 'x', 'maybe')$q$),
  'only the listed client answers');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note, chased_on, next_follow_up)
  values ('f9000000-0000-4000-8000-000000000008', 'email', 'x', current_date, current_date - 1)$q$),
  'a call-back date cannot be before the follow-up');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note, chased_on)
  values ('f9000000-0000-4000-8000-000000000008', 'email', 'x', current_date + 10)$q$),
  'a follow-up cannot be dated in the future');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'email', '  ')$q$),
  'a follow-up needs a note, an answer or a call-back date');
update public.quote_chase_log set note = 'changed by sales';
delete from public.quote_chase_log;

insert into public.quote_chase_tasks (id, quotation_id, step_day, kind, due_on)
values ('f9200000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000008', 21, 'escalate', current_date);
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 1, 'sales can add the task for a step');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_tasks (quotation_id, step_day, kind, due_on)
  values ('f9000000-0000-4000-8000-000000000008', 21, 'escalate', current_date)$q$),
  'one task per quote, kind and step');
insert into public.quote_chase_tasks (quotation_id, step_day, kind, due_on)
values ('f9000000-0000-4000-8000-000000000008', 3, 'expiry', current_date);
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 2, 'the same quote can have an expiry task too');
delete from public.quote_chase_tasks where kind = 'expiry';
reset role;
delete from public.quote_chase_tasks where kind = 'expiry';
select pg_temp.login('sales');
update public.quote_chase_tasks set status = 'done', outcome = 'Owner called them', step_day = 3, kind = 'followup'
where id = 'f9200000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select done_by_email = 'mt-sales@redreach.ae' and done_at is not null and step_day = 21 and kind = 'escalate'
   from public.quote_chase_tasks where id = 'f9200000-0000-4000-8000-000000000001'),
  'finishing a task records who and when, and the step stays as it was');
delete from public.quote_chase_tasks;

select pg_temp.expect(pg_temp.fails($q$insert into public.quote_chase_settings (followup_days, escalate_days) values ('{2,9}', 20)$q$),
  'sales cannot set the follow-up schedule');
reset role;

select pg_temp.expect(
  (select note from public.quote_chase_log where id = 'f9100000-0000-4000-8000-000000000001') = 'Wants a revised price',
  'sales cannot change a follow-up');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 1, 'sales cannot remove a follow-up');
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 1, 'sales cannot remove a task');
select pg_temp.expect(
  (select status from public.quotations where id = 'f9000000-0000-4000-8000-000000000008') = 'Sent',
  'a follow-up never changes the quote');

------------------------------------------------------------
-- Sales without "see company money": only their own quotes
------------------------------------------------------------
delete from public.user_permissions
where user_id = (select id from public.app_users where email = 'mt-sales@redreach.ae') and permission = 'finance.company';
update public.quote_chase_tasks set status = 'open' where id = 'f9200000-0000-4000-8000-000000000001';

select pg_temp.login('sales');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 0, 'locked sales cannot read follow-ups of someone else''s quote');
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 0, 'locked sales cannot read tasks of someone else''s quote');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'call', 'not mine')$q$),
  'locked sales cannot log a follow-up on someone else''s quote');
insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000009', 'call', 'my own client');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 1, 'locked sales logs and reads follow-ups of their own quote');
insert into public.quote_chase_tasks (quotation_id, step_day, kind, due_on)
values ('f9000000-0000-4000-8000-000000000009', 3, 'followup', current_date);
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 1, 'locked sales adds the task of their own quote');
update public.quote_chase_tasks set status = 'skipped' where id = 'f9200000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect(
  (select status from public.quote_chase_tasks where id = 'f9200000-0000-4000-8000-000000000001') = 'open',
  'locked sales cannot work a task of someone else''s quote (it stays as it was)');
delete from public.quote_chase_tasks where quotation_id = 'f9000000-0000-4000-8000-000000000009';
delete from public.quote_chase_log where quotation_id = 'f9000000-0000-4000-8000-000000000009';
update public.quote_chase_tasks set status = 'done' where id = 'f9200000-0000-4000-8000-000000000001';
insert into public.user_permissions (user_id, permission)
select id, 'finance.company' from public.app_users where email = 'mt-sales@redreach.ae'
on conflict do nothing;

------------------------------------------------------------
-- manager and admin
------------------------------------------------------------
select pg_temp.login('manager');
insert into public.quote_chase_settings (followup_days, expiry_warn_days, escalate_days) values ('{3,7,14}', 3, 21);
select pg_temp.expect((select count(*) from public.quote_chase_settings) = 1, 'manager can set the follow-up schedule');
update public.quote_chase_settings set escalate_days = 28;
select pg_temp.expect((select escalate_days from public.quote_chase_settings) = 28, 'manager can change the schedule');
select pg_temp.expect(pg_temp.fails($q$update public.quote_chase_settings set followup_days = '{0,7}'$q$), 'follow-up days are 1 to 180');
select pg_temp.expect(pg_temp.fails($q$update public.quote_chase_settings set followup_days = '{}'$q$), 'at least one follow-up day');
select pg_temp.expect(pg_temp.fails($q$update public.quote_chase_settings set expiry_warn_days = 90$q$), 'expiry reminder is 0 to 60 days');
update public.quote_chase_log set note = 'Wants a revised price (confirmed)', created_by_email = 'someone@else'
where id = 'f9100000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select note = 'Wants a revised price (confirmed)' and created_by_email = 'mt-sales@redreach.ae'
   from public.quote_chase_log where id = 'f9100000-0000-4000-8000-000000000001'),
  'manager can correct a follow-up; who logged it stays');
reset role;

select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 1, 'admin reads the follow-up log');
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 1, 'admin reads follow-up tasks');
update public.quote_chase_settings set escalate_days = 21;
select pg_temp.expect((select escalate_days from public.quote_chase_settings) = 21, 'admin can change the schedule');
reset role;

------------------------------------------------------------
-- viewer: read only
------------------------------------------------------------
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 1, 'viewer reads the follow-up log');
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 1, 'viewer reads follow-up tasks');
select pg_temp.expect((select count(*) from public.quote_chase_settings) = 1, 'viewer reads the schedule');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'email', 'viewer')$q$),
  'viewer cannot log a follow-up');
update public.quote_chase_tasks set status = 'skipped';
reset role;
select pg_temp.expect((select status from public.quote_chase_tasks limit 1) = 'done', 'viewer cannot work tasks');

------------------------------------------------------------
-- staff role, strangers and other tenants: nothing
------------------------------------------------------------
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 0, 'staff role cannot read the follow-up log');
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 0, 'staff role cannot read follow-up tasks');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'email', 'staff')$q$),
  'staff role cannot log a follow-up');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 0, 'stranger sees no follow-ups');
select pg_temp.expect((select count(*) from public.quote_chase_settings) = 0, 'stranger sees no schedule');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 0, 'tenant B cannot see tenant A follow-ups');
select pg_temp.expect((select count(*) from public.quote_chase_tasks) = 0, 'tenant B cannot see tenant A tasks');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'email', 'from B')$q$),
  'tenant B cannot log a follow-up on a tenant A quote');
insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-0000000000b1', 'email', 'own tenant');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 1, 'tenant B logs follow-ups on its own quotes');
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
select 'f9900000-0000-4000-8000-000000000001', 'Quote chase test key', 'hmk_qcha', repeat('8', 64), 'sales', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'mt-sales@redreach.ae';
reset role;

select pg_temp.login_mcp('sales', 'f9900000-0000-4000-8000-000000000001');
insert into public.quote_chase_log (id, quotation_id, channel, contact, note)
values ('f9100000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000008', 'email', 'Reception', 'Sent the quote again');
select pg_temp.expect(
  (select source from public.quote_chase_log where id = 'f9100000-0000-4000-8000-000000000002') = 'ai',
  'an AI key can log a follow-up, marked ai');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_tasks (quotation_id, step_day, kind, due_on)
  values ('f9000000-0000-4000-8000-000000000008', 7, 'followup', current_date)$q$),
  'an AI key cannot add follow-up tasks');
update public.quote_chase_tasks set status = 'open';
select pg_temp.expect((select status from public.quote_chase_tasks limit 1) = 'open', 'an AI key can work a follow-up task');
update public.quote_chase_settings set escalate_days = 10;
update public.quote_chase_log set note = 'AI edit';
delete from public.quote_chase_log;
reset role;
select pg_temp.logout();
select pg_temp.expect((select escalate_days from public.quote_chase_settings where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 21,
  'an AI key cannot change the schedule');
select pg_temp.expect((select count(*) from public.quote_chase_log where note = 'AI edit') = 0, 'an AI key cannot edit follow-ups');
select pg_temp.expect((select count(*) from public.quote_chase_log where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 2,
  'an AI key cannot remove follow-ups');

------------------------------------------------------------
-- AI connector: keys with departments follow quotes
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
select v.id::uuid, v.name, 'hmk_qcd', v.hash, 'admin', 'admin', 'grok', v.depts::text[], u.id, 'mt-admin@redreach.ae'
from public.app_users u,
  (values ('f9910000-0000-4000-8000-000000000001', 'Quote chase sales', repeat('4', 64), '{sales}'),
          ('f9910000-0000-4000-8000-000000000002', 'Quote chase HR', repeat('3', 64), '{hr}')
  ) as v(id, name, hash, depts)
where u.email = 'ai-assistant@redreach.ae';
reset role;

select pg_temp.login_ai('f9910000-0000-4000-8000-000000000001');
insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'call', 'Sales key follow-up');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 3, 'a sales key reads and logs follow-ups');
select pg_temp.expect(pg_temp.fails($q$update public.quote_chase_settings set escalate_days = 11$q$), 'a sales key is refused when changing the schedule');
reset role;
select pg_temp.logout();

select pg_temp.login_ai('f9910000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) from public.quote_chase_log) = 0, 'an HR key cannot read follow-ups');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_chase_log (quotation_id, channel, note) values ('f9000000-0000-4000-8000-000000000008', 'call', 'HR key')$q$),
  'an HR key cannot log follow-ups');
reset role;
select pg_temp.logout();

rollback;
