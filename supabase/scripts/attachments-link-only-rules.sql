-- Attachments clean-up (item 3 of docs/PRODUCTION_DATA_CHECK.md).
-- Turns on the two link-only rules from 20261009150000_attachments_no_data_urls.sql
-- WITHOUT deleting anything: it stops with a message if any attachment still
-- holds a file inside the database (data:) or a non-https link.
-- Safe to re-run.
begin;

do $$
declare
  n_data integer;
  n_other integer;
begin
  select count(*) filter (where url ilike 'data:%'),
         count(*) filter (where url <> '' and url !~* '^https://' and url !~* '^data:')
    into n_data, n_other
  from public.attachments;
  if n_data > 0 or n_other > 0 then
    raise exception 'Not changed: % attachments still hold a file in the database and % have a non-https link. Save them to WorkDrive and remove them from their records first.', n_data, n_other;
  end if;
end $$;

alter table public.attachments drop constraint if exists attachments_url_no_data;
alter table public.attachments
  add constraint attachments_url_no_data check (url = '' or url !~* '^data:');
alter table public.attachments drop constraint if exists attachments_url_https_or_empty;
alter table public.attachments
  add constraint attachments_url_https_or_empty check (url = '' or url ~* '^https://');
comment on column public.attachments.url is
  'Zoho WorkDrive (or other) https share link only — never data: blobs.';

notify pgrst, 'reload schema';

commit;
