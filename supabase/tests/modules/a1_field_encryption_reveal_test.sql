-- HighMast A1: encrypted ID numbers, masked by default, reveal with permission +
-- rate limit + audit, raw dump unreadable, backfill dry run and reverse.
-- Supabase Vault is stubbed inside the transaction.
begin;
\ir _fixtures.sql

create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('hm_fle_key_v1', 'a1-test-key-0123456789abcdef0123456789abcdef')
on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;

-- Existing plain rows saved before the key (simulate: drop key, insert, restore key)
update vault.decrypted_secrets set name = 'parked' where name = 'hm_fle_key_v1';
insert into public.hr_employees (id, employee_code, full_name, basic_salary_aed, iban)
values ('f5000000-0000-4000-8000-000000000001', 'E-1', 'Old Row', 23456.78, 'AE070331234567890121111');
insert into public.wanders_passengers (id, tenant_id, passport_number)
values ('f5000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001', 'N1234567');
insert into public.app_settings (key, value) values ('a1_test_refresh_token', 'tok-SECRET-123')
on conflict (key) do update set value = excluded.value;
update vault.decrypted_secrets set name = 'hm_fle_key_v1' where name = 'parked';
select pg_temp.expect((select basic_salary_enc is null from public.hr_employees where id = 'f5000000-0000-4000-8000-000000000001'), 'old row starts unencrypted');

-- Backfill: dry run changes nothing, then the real run encrypts
select pg_temp.expect((select rows_needing_encryption >= 1 and rows_changed = 0 from public.rr_fle_backfill('hr')), 'hr dry run counts without changing');
select pg_temp.expect((select basic_salary_enc is null from public.hr_employees where id = 'f5000000-0000-4000-8000-000000000001'), 'dry run left the row alone');
select pg_temp.expect((select rows_changed >= 1 from public.rr_fle_backfill('hr', false)), 'hr backfill encrypts');
select pg_temp.expect((select rows_changed >= 1 from public.rr_fle_backfill('wanders', false)), 'wanders backfill encrypts');
select pg_temp.expect((select rows_changed >= 1 from public.rr_fle_backfill('settings', false)), 'settings backfill encrypts');
select pg_temp.expect((select basic_salary_enc like 'fle:v1:%' and iban_enc like 'fle:v1:%' from public.hr_employees where id = 'f5000000-0000-4000-8000-000000000001'), 'salary and IBAN now encrypted');
select pg_temp.expect(public.rr_fle_decrypt((select basic_salary_enc from public.hr_employees where id = 'f5000000-0000-4000-8000-000000000001')) = '23456.78', 'backfill round trip');
select pg_temp.expect(public.rr_app_secret('a1_test_refresh_token') = 'tok-SECRET-123', 'service role reads secret setting');

-- Envelope: same value twice gives different ciphertexts (random session key per value)
select pg_temp.expect(public.rr_fle_encrypt('same') <> public.rr_fle_encrypt('same'), 'each value has its own session key');

-- ID numbers are stored encrypted only
select pg_temp.login('sales');
select pg_temp.expect(pg_temp.fails($q$select public.rr_hr_set_identity('f5000000-0000-4000-8000-000000000001', 'emirates_id', '784-1990-1234567-1')$q$), 'sales cannot write ID numbers');
select pg_temp.login('manager');
select public.rr_hr_set_identity('f5000000-0000-4000-8000-000000000001', 'emirates_id', '784-1990-1234567-1');
select public.rr_hr_set_identity('f5000000-0000-4000-8000-000000000001', 'passport_no', 'Z9876543');
select public.rr_hr_set_identity('f5000000-0000-4000-8000-000000000001', 'national_id', 'ABCDE1234F', 'pan');
select pg_temp.expect(pg_temp.fails($q$select public.rr_hr_set_identity('f5000000-0000-4000-8000-000000000001', 'national_id', 'x', 'ssn')$q$), 'unknown national ID type refused');
reset role;
set local request.jwt.claim.sub = '';
select pg_temp.expect((select emirates_id_enc like 'fle:v1:%' and passport_no_enc like 'fle:v1:%' and national_id_type = 'pan' from public.hr_employees where id = 'f5000000-0000-4000-8000-000000000001'), 'ID numbers encrypted');

-- Enforce everywhere, then a raw dump of the tables shows no plain sensitive value
insert into public.app_settings (key, value) values ('fle.enforce.hr', 'true'), ('fle.enforce.wanders', 'true'), ('fle.enforce.settings', 'true')
on conflict (key) do update set value = 'true';
select public.rr_fle_backfill(s, false) from unnest(array['hr', 'wanders', 'settings', 'payroll']) s;
select pg_temp.expect(
  (select string_agg(row_to_json(t)::text, ' ') from public.hr_employees t where id = 'f5000000-0000-4000-8000-000000000001')
    !~ '(23456|AE0703312345678901211|1234567|Z9876543|ABCDE1234F)',
  'raw dump of hr_employees has no salary, IBAN or ID number');
select pg_temp.expect(
  (select string_agg(row_to_json(t)::text, ' ') from public.wanders_passengers t where id = 'f5000000-0000-4000-8000-0000000000a1') !~ 'N1234567',
  'raw dump of wanders_passengers has no passport number');
select pg_temp.expect(
  (select string_agg(row_to_json(t)::text, ' ') from public.app_settings t where key = 'a1_test_refresh_token') !~ 'SECRET',
  'raw dump of app_settings has no token');
select pg_temp.expect(
  coalesce((select string_agg(coalesce(old_data::text, '') || coalesce(new_data::text, ''), ' ') from public.audit_log where table_name in ('app_settings', 'hr_employees', 'wanders_passengers')), '') !~ '(23456|SECRET|N1234567)',
  'audit log holds no plain sensitive values');
select pg_temp.expect(public.rr_app_secret('a1_test_refresh_token') = 'tok-SECRET-123', 'secret still readable by the service role after enforcement');

-- Masked by default, for every role
select pg_temp.login('sales');
select pg_temp.expect(
  (select basic_salary = '•••' and iban = 'AE•• •••• 1111' and emirates_id = '•••• 5671' and passport_no = '•••• 6543' and national_id = '•••• 234F'
   from public.rr_hr_masked('f5000000-0000-4000-8000-000000000001')),
  'masked view shows masks only');

-- A user without permission gets a mask, and the attempt is logged
select pg_temp.expect(
  (select masked and outcome = 'denied' and value = '•••' from public.rr_fle_reveal('hr.basic_salary', 'f5000000-0000-4000-8000-000000000001', 'curious')),
  'sales reveal is denied and masked');
select pg_temp.login('viewer');
select pg_temp.expect(
  (select masked and value = '•••• 6543' from public.rr_fle_reveal('hr.passport_no', 'f5000000-0000-4000-8000-000000000001')),
  'viewer sees masked passport');

-- Permitted reveal returns plain text and writes an audit entry
select pg_temp.login('manager');
select pg_temp.expect(
  (select not masked and value = '23456.78' and outcome = 'revealed' from public.rr_fle_reveal('hr.basic_salary', 'f5000000-0000-4000-8000-000000000001', 'payroll check')),
  'manager reveals salary');
select pg_temp.expect(
  (select value = '784-1990-1234567-1' from public.rr_fle_reveal('hr.emirates_id', 'f5000000-0000-4000-8000-000000000001', 'visa renewal')),
  'manager reveals Emirates ID');
select pg_temp.expect(
  (select value = 'N1234567' from public.rr_fle_reveal('wanders.passport_number', 'f5000000-0000-4000-8000-0000000000a1', 'ticketing')),
  'manager reveals passenger passport');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_fle_reveal('hr.made_up', 'f5000000-0000-4000-8000-000000000001')$q$), 'unknown field refused');
select pg_temp.login('b_admin');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_fle_reveal('hr.basic_salary', 'f5000000-0000-4000-8000-000000000001')$q$), 'other tenant cannot reveal');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_hr_masked('f5000000-0000-4000-8000-000000000001')$q$), 'other tenant cannot see masks');
select pg_temp.login('stranger');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_fle_reveal('hr.basic_salary', 'f5000000-0000-4000-8000-000000000001')$q$), 'stranger refused');
select pg_temp.login('admin');
select pg_temp.expect(
  (select count(*) from public.fle_access_log where row_id = 'f5000000-0000-4000-8000-000000000001' and outcome = 'revealed' and reason = 'payroll check') = 1,
  'reveal wrote an audit entry with the reason');
select pg_temp.expect(
  (select count(*) from public.fle_access_log where row_id = 'f5000000-0000-4000-8000-000000000001' and outcome = 'denied') = 2,
  'denied attempts (sales, viewer) are in the audit log');
select pg_temp.expect(
  (select string_agg(f::text, ' ') from public.fle_access_log f) !~ '(23456|1234567-1|N1234567)',
  'audit entries never contain the revealed value');

-- Rate limit
reset role;
set local request.jwt.claim.sub = '';
insert into public.app_settings (key, value) values ('fle.reveal_limit_per_10min', '3') on conflict (key) do update set value = '3';
select pg_temp.login('admin');
select public.rr_fle_reveal('hr.iban', 'f5000000-0000-4000-8000-000000000001') from generate_series(1, 3);
select pg_temp.expect(
  (select masked and outcome = 'rate_limited' from public.rr_fle_reveal('hr.iban', 'f5000000-0000-4000-8000-000000000001')),
  'fourth reveal in 10 minutes is rate limited and masked');

-- Admin-only backfill; reverse needs enforcement off; dry run first
select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_fle_backfill('hr', false)$q$), 'manager cannot run the backfill');
reset role;
set local request.jwt.claim.sub = '';
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_fle_backfill_reverse('hr', false)$q$), 'reverse refused while enforcement is on');
update public.app_settings set value = 'false' where key in ('fle.enforce.hr', 'fle.enforce.wanders', 'fle.enforce.settings');
select pg_temp.expect((select rows_to_restore >= 1 and rows_changed = 0 from public.rr_fle_backfill_reverse('hr')), 'reverse dry run counts only');
select public.rr_fle_backfill_reverse(s, false) from unnest(array['hr', 'wanders', 'settings']) s;
select pg_temp.expect((select basic_salary_aed = 23456.78 and iban = 'AE070331234567890121111' from public.hr_employees where id = 'f5000000-0000-4000-8000-000000000001'), 'reverse restores salary and IBAN');
select pg_temp.expect((select passport_number = 'N1234567' from public.wanders_passengers where id = 'f5000000-0000-4000-8000-0000000000a1'), 'reverse restores passport');
select pg_temp.expect((select value = 'tok-SECRET-123' from public.app_settings where key = 'a1_test_refresh_token'), 'reverse restores the token');

rollback;
