-- Stop storing binary blobs in attachments.url (data: URLs).
-- Clear legacy rows first, then enforce https-only / empty URLs.

-- 1) Drop inlined binaries
delete from public.attachments
where url ilike 'data:%';

-- 2) Inspect leftovers that would break the https CHECK (optional; for SQL editor):
--    select entity_type, left(url, 80), count(*)
--    from attachments
--    where url <> '' and url !~* '^https://'
--    group by 1, 2;

-- 3) Prefer http → https when it's a plain http URL; otherwise blank the url
--    so metadata rows remain but the CHECK can be applied.
update public.attachments
set url = 'https://' || substr(url, 8)
where url ~* '^http://';

update public.attachments
set url = ''
where url <> '' and url !~* '^https://';

alter table public.attachments
  drop constraint if exists attachments_url_no_data;

alter table public.attachments
  add constraint attachments_url_no_data
  check (url = '' or url !~* '^data:');

alter table public.attachments
  drop constraint if exists attachments_url_https_or_empty;

alter table public.attachments
  add constraint attachments_url_https_or_empty
  check (url = '' or url ~* '^https://');

comment on column public.attachments.url is
  'Zoho WorkDrive (or other) https share link only — never data: blobs.';

notify pgrst, 'reload schema';
