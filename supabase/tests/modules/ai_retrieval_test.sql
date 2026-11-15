begin;
\ir _fixtures.sql

select pg_temp.login('sales');
insert into public.ai_knowledge_docs (tenant_id, title, body, source)
values
  ('a0000000-0000-4000-8000-000000000001', 'UAE VAT', 'Standard VAT rate is five percent in the UAE.', 'manual'),
  ('a0000000-0000-4000-8000-000000000001', 'WPS draft', 'Wage protection system files are draft only.', 'manual');

select pg_temp.expect(
  (select count(*) from public.rr_ai_search_docs('VAT', 5)) >= 1,
  'FTS finds VAT doc');
select pg_temp.expect(
  (select title from public.rr_ai_search_docs('protection wage', 5) limit 1) = 'WPS draft',
  'FTS ranks WPS for wage protection');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.ai_knowledge_docs where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A knowledge docs');
reset role;

rollback;
