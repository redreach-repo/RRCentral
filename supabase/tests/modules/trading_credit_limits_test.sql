begin;
\ir _fixtures.sql

insert into public.accounts (id, tenant_id, type, name, reference, status, credit_limit_aed, credit_hold)
values (
  'e6000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'ai_crm_client',
  'Credit Limit Co',
  'AC-07-26999',
  'active',
  5000,
  false
);

select pg_temp.login('admin');
update public.accounts set credit_hold = true where id = 'e6000000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select credit_hold from public.accounts where id = 'e6000000-0000-4000-8000-000000000001') = true,
  'admin can set credit hold');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.accounts where id = 'e6000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A credit account');
reset role;

rollback;
