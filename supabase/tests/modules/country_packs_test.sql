begin;
\ir _fixtures.sql

select pg_temp.expect((select count(*) from public.country_packs where pack_key in ('ae','in','ca')) = 3, 'three starter country packs');

select pg_temp.login('admin');
insert into public.tenant_country_packs (tenant_id, pack_id, status, activated_at)
select 'a0000000-0000-4000-8000-000000000001', id, 'active', now()
from public.country_packs where pack_key = 'in';
select pg_temp.expect((select count(*) from public.tenant_country_packs where status = 'active') = 1, 'admin activates India pack');
reset role;

select pg_temp.login('sales');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.tenant_country_packs (pack_id, status) select id, 'active' from public.country_packs where pack_key = 'ca'$q$),
  'sales cannot activate country packs');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.tenant_country_packs where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A country pack activations');
reset role;

rollback;
