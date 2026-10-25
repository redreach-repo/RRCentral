-- PR M: Fireflies calls on the timeline. A meeting attached from Fireflies is
-- a Meeting on the account's timeline that remembers where it came from, so
-- the same call cannot be attached twice. Existing RLS on account_activities
-- applies unchanged. Safe to run more than once.

alter table public.account_activities add column if not exists external_source text not null default '';
alter table public.account_activities add column if not exists external_id text not null default '';

create unique index if not exists account_activities_external_key
  on public.account_activities (account_id, external_source, external_id)
  where external_id <> '';

notify pgrst, 'reload schema';
