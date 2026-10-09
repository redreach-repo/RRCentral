-- Stop storing binary blobs in attachments.url (data: URLs).
-- Clear legacy rows first, then enforce https-only / empty URLs.

delete from public.attachments
where url ilike 'data:%';

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
