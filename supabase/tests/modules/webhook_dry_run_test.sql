begin;
\ir _fixtures.sql

select pg_temp.login('admin');

select pg_temp.expect(
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'webhook_endpoints'
      and column_name = 'dry_run') = 1,
  'webhook_endpoints has dry_run');

reset role;
rollback;
