-- Demo seed pack: refuses without the flag, refuses a real-looking database,
-- loads cleanly into an empty one with fictional data only (docs/modules/demo-isolation.md).
-- run.sh runs this from supabase/, so the seed path is relative to that.
begin;
\ir _fixtures.sql
\set seed_sql `cat seed/demo/demo_seed.sql`

create or replace function pg_temp.try_sql(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

select pg_temp.expect(pg_temp.try_sql(:'seed_sql') like 'DEMO SEED REFUSED: run%', 'refused without app.demo_seed flag');

set local app.demo_seed = 'yes';
insert into public.invoices (client, reference_number) values ('Real Client', 'RR-01-26999');
select pg_temp.expect(pg_temp.try_sql(:'seed_sql') like 'DEMO SEED REFUSED: this database already has%', 'refused on a database that has invoices');
select pg_temp.expect((select count(*) from public.accounts where source = 'demo') = 0, 'refusal changed nothing');

truncate public.invoices, public.quotations cascade;
select pg_temp.expect(pg_temp.try_sql(:'seed_sql') = 'ok', 'loads into an empty database');
select pg_temp.expect((select count(*) from public.accounts where source = 'demo') = 4, '4 fictional accounts');
select pg_temp.expect((select count(*) from public.invoices where reference_number like 'DEMO-%') = 2, '2 demo invoices');
select pg_temp.expect(
  (select is_demo and name like '%(demo)' from public.tenants where id = 'a0000000-0000-4000-8000-000000000001'),
  'tenant marked as demo');
select pg_temp.expect(
  not exists (
    select 1 from public.accounts where source = 'demo' and (name ilike '%red reach%' or name ilike '%tee tribe%' or website not like '%.example')
  ),
  'no real brands; all websites on .example');
select pg_temp.expect(
  not exists (select 1 from public.crm where account_id is not null and email_phone not like '%.example' and id::text like 'd2%'),
  'all demo emails on .example');

rollback;
