begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.mfa_passkey_stubs (id, tenant_id, user_email, nickname)
values (
  'e9200000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'mt-admin@redreach.ae',
  'Laptop'
);
select pg_temp.expect(
  (select count(*) from public.mfa_passkey_stubs where nickname = 'Laptop') = 1,
  'admin can insert own passkey stub');
reset role;

select pg_temp.login('sales');
select pg_temp.expect(
  (select count(*) from public.mfa_passkey_stubs where nickname = 'Laptop') = 0,
  'sales cannot read admin passkey stub');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.mfa_passkey_stubs where nickname = 'Laptop') = 0,
  'tenant B cannot see tenant A passkey stubs');
reset role;

rollback;
