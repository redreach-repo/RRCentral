-- Client page (HighMast brief fix 3, part 2; Alfred 2026-11-28).
--
-- The client page header shows a short name next to the legal name (e.g.
-- "Sharjah Ready Mix" for "Sharjah Ready Mix Concrete Company L.L.C SP").
-- Everything else on the page reads what is already there, through each
-- table's own access rules, so this file only adds that one column.
-- Who can read or change it: the same people as the rest of the client record.
--
-- Safe to re-run.
--
-- To reverse:
--   alter table public.clients drop column if exists short_name;

alter table public.clients add column if not exists short_name text not null default '';

comment on column public.clients.short_name is
  'Everyday name shown on the client page next to the legal name (company_name).';

notify pgrst, 'reload schema';
