-- Row count of every table in public, plus auth.users, as "table<TAB>count".
-- Used by the backup restore check to compare the live database with a
-- restored copy.
select table_schema || '.' || table_name as t,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as n
from information_schema.tables
where table_type = 'BASE TABLE'
  and (table_schema = 'public' or (table_schema = 'auth' and table_name = 'users'))
order by 1;
