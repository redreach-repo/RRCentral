-- Clean attachments.url before the https-only CHECK (migration 20261009150000).
-- Safe to re-run. Count first:
--   select entity_type, count(*) from attachments where url like 'data:%' group by 1;
--   select entity_type, left(url, 80), count(*) from attachments
--     where url <> '' and url !~* '^https://' group by 1, 2;

delete from attachments
where url like 'data:%';

update attachments
set url = 'https://' || substr(url, 8)
where url ~* '^http://';

update attachments
set url = ''
where url <> '' and url !~* '^https://';
