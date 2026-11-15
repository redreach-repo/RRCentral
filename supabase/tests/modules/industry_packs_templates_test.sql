begin;
\ir _fixtures.sql

select pg_temp.expect(
  (select (manifest->'templates'->'custom_fields') is not null from public.industry_packs where pack_key = 'engineering'),
  'engineering pack has templates');
select pg_temp.expect(
  (select (manifest->'templates'->'pipelines') is not null from public.industry_packs where pack_key = 'construction'),
  'construction pack has pipeline templates');
select pg_temp.expect(
  (select (manifest->'templates'->'custom_fields') is not null from public.industry_packs where pack_key = 'trading_import'),
  'trading pack has field templates');
select pg_temp.expect(
  (select (manifest->'templates'->'pipelines') is not null from public.industry_packs where pack_key = 'logistics'),
  'logistics pack has pipeline templates');
select pg_temp.expect(
  (select (manifest->'templates'->'custom_fields') is not null from public.industry_packs where pack_key = 'events_tours'),
  'events_tours pack has field templates');

rollback;
