begin;
\ir _fixtures.sql

select pg_temp.expect((select count(*) from public.business_type_packs) >= 6, 'business type packs seeded');

select pg_temp.login('admin');
insert into public.tenant_app_identities (tenant_id, host_slug, display_name, short_name)
values ('a0000000-0000-4000-8000-000000000001', 'alnoor', 'Al Noor', 'Al Noor');
select pg_temp.expect((select count(*) from public.tenant_app_identities where host_slug = 'alnoor') = 1, 'admin can create app identity');
reset role;

select pg_temp.login('sales');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.tenant_app_identities (host_slug, display_name, short_name) values ('sales-slug', 'Sales Co', 'Sales')$q$),
  'sales cannot write app identities');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.tenant_app_identities where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A identities');
reset role;

rollback;
