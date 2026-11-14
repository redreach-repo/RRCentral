-- Field-level encryption: round trip, masking per role, enforcement, key versions, access log.
-- Supabase Vault is stubbed here (vault.decrypted_secrets) inside the test transaction.
begin;
\ir _fixtures.sql

-- Before any key: saving still works (enforcement off), nothing encrypted
insert into public.hr_employees (id, employee_code, full_name, basic_salary_aed, iban)
values ('f0000000-0000-4000-8000-000000000001', 'T-1', 'Before Key', 12000, 'AE070331234567890123456');
select pg_temp.expect((select basic_salary_enc is null from public.hr_employees where id = 'f0000000-0000-4000-8000-000000000001'), 'no key: saved without encryption');
select pg_temp.expect(not public.rr_fle_ready(), 'not ready without a key');

-- Enforcement on without key refuses to save plain salary
insert into public.app_settings (key, value) values ('fle.enforce.hr', 'true')
on conflict (key) do update set value = excluded.value;
select pg_temp.expect(pg_temp.fails($q$insert into public.hr_employees (employee_code, full_name, basic_salary_aed) values ('T-3', 'x', 1)$q$), 'enforced + no key: save refused');
update public.app_settings set value = 'false' where key = 'fle.enforce.hr';

-- Stub Vault with key v1
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('hm_fle_key_v1', 'test-key-v1-0123456789abcdef0123456789abcdef');
select pg_temp.expect(public.rr_fle_ready(), 'ready once the Vault key exists');

insert into public.hr_employees (id, employee_code, full_name, basic_salary_aed, iban)
values ('f0000000-0000-4000-8000-000000000002', 'T-2', 'Sara Example', 18500.50, 'AE07 0331 2345 6789 0123 456');
select pg_temp.expect(
  (select basic_salary_enc like 'fle:v1:%' and iban_enc like 'fle:v1:%' and basic_salary_enc not like '%18500%'
   from public.hr_employees where id = 'f0000000-0000-4000-8000-000000000002'),
  'salary and IBAN encrypted on save');
select pg_temp.expect(public.rr_fle_decrypt((select basic_salary_enc from public.hr_employees where id = 'f0000000-0000-4000-8000-000000000002')) = '18500.50', 'round trip');
select pg_temp.expect(
  (select a.basic_salary_enc <> b.basic_salary_enc from public.hr_employees a, public.hr_employees b
   where a.id = 'f0000000-0000-4000-8000-000000000002' and b.id = 'f0000000-0000-4000-8000-000000000002') is not null,
  'ciphertext present');

-- Wrong key cannot decrypt
update vault.decrypted_secrets set decrypted_secret = 'wrong-key-0000000000000000000000000000000000' where name = 'hm_fle_key_v1';
select pg_temp.expect(pg_temp.fails($q$select public.rr_fle_decrypt((select basic_salary_enc from public.hr_employees where id = 'f0000000-0000-4000-8000-000000000002'))$q$), 'wrong key fails');
update vault.decrypted_secrets set decrypted_secret = 'test-key-v1-0123456789abcdef0123456789abcdef' where name = 'hm_fle_key_v1';
select pg_temp.expect(pg_temp.fails($q$insert into vault.decrypted_secrets values ('hm_fle_key_v9', 'short'); select public.rr_fle_key(9)$q$), 'short key refused');

-- App users cannot call the internals
select pg_temp.login('admin');
select pg_temp.expect(pg_temp.fails($q$select public.rr_fle_decrypt('fle:v1:abc')$q$), 'admin cannot call decrypt directly');
select pg_temp.expect(pg_temp.fails($q$select public.rr_fle_key(1)$q$), 'admin cannot read the key');
select pg_temp.expect(pg_temp.fails($q$select public.rr_fle_encrypt('x')$q$), 'admin cannot call encrypt directly');

-- Reads through rr_hr_sensitive: plain for manager/admin, masked for others, logged
select pg_temp.login('manager');
select pg_temp.expect(
  (select basic_salary_aed = 18500.50 and iban = 'AE07 0331 2345 6789 0123 456' and not masked from public.rr_hr_sensitive('f0000000-0000-4000-8000-000000000002')),
  'manager reads plain salary and IBAN');
select pg_temp.login('sales');
select pg_temp.expect(
  (select basic_salary_aed is null and iban = 'AE•• •••• 3456' and masked from public.rr_hr_sensitive('f0000000-0000-4000-8000-000000000002')),
  'sales gets masked values');
select pg_temp.login('stranger');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_hr_sensitive('f0000000-0000-4000-8000-000000000002')$q$), 'stranger refused');
select pg_temp.login('b_admin');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_hr_sensitive('f0000000-0000-4000-8000-000000000002')$q$), 'other tenant refused');
select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.fle_access_log where row_id = 'f0000000-0000-4000-8000-000000000002') = 2, 'admin sees both reads in access log');
select pg_temp.expect(pg_temp.fails($q$insert into public.fle_access_log (field_key, row_id, outcome) values ('x', 'y', 'plain')$q$), 'nobody writes the access log directly');
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.fle_access_log) = 0, 'manager cannot read access log');
reset role;
set local request.jwt.claim.sub = '';

-- Enforce: plain columns blanked, value still readable
update public.app_settings set value = 'true' where key = 'fle.enforce.hr';
select pg_temp.expect(public.rr_fle_reencrypt_hr() >= 2, 'backfill encrypts older rows');
select pg_temp.expect(
  (select bool_and(basic_salary_aed is null and iban = '' and (basic_salary_enc is not null)) from public.hr_employees where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002')),
  'enforced: no plain salary or IBAN left in the table');
select pg_temp.login('admin');
select pg_temp.expect((select basic_salary_aed = 12000 from public.rr_hr_sensitive('f0000000-0000-4000-8000-000000000001')), 'older row readable after backfill');
select pg_temp.expect(not pg_temp.fails($q$update public.hr_employees set job_title = 'Lead' where id = 'f0000000-0000-4000-8000-000000000002'$q$), 'editing other fields keeps the encrypted salary');
select pg_temp.expect((select basic_salary_aed = 18500.50 from public.rr_hr_sensitive('f0000000-0000-4000-8000-000000000002')), 'salary intact after unrelated edit');
reset role;
set local request.jwt.claim.sub = '';

-- Rotation to v2
insert into vault.decrypted_secrets values ('hm_fle_key_v2', 'test-key-v2-fedcba9876543210fedcba9876543210');
insert into public.app_settings (key, value) values ('fle.key_version', '2') on conflict (key) do update set value = excluded.value;
select public.rr_fle_reencrypt_hr();
select pg_temp.expect(
  (select bool_and(basic_salary_enc like 'fle:v2:%') from public.hr_employees where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002')),
  'rotation re-encrypts under v2');
select pg_temp.login('admin');
select pg_temp.expect((select basic_salary_aed = 18500.50 from public.rr_hr_sensitive('f0000000-0000-4000-8000-000000000002')), 'readable after rotation');
reset role;
set local request.jwt.claim.sub = '';

rollback;
