begin;

-- RR Central roadmap item 14: two step sign in and error monitoring.
--
-- 1. Two step sign in (an authenticator app code after the password) is
--    required in the app for admins and managers. Supabase Auth stores the
--    authenticator in auth.mfa_factors. rr_team_two_step() lets an admin
--    see who on the team has set it up, without exposing anything else.
-- 2. app_errors: errors the app hits in someone's browser (a crash, a failed
--    save the code did not expect) are reported here, so you hear about a
--    failure before a client does. Team members can add rows; only admins
--    read and clear them. The daily digest email lists the last day's errors.
--
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop function if exists public.rr_team_two_step();
--   drop table if exists public.app_errors;

------------------------------------------------------------
-- 1. Who has two step sign in
------------------------------------------------------------
create or replace function public.rr_team_two_step()
returns table (email text, role text, active boolean, has_two_step boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.email::text,
    u.role::text,
    u.active,
    exists (
      select 1
      from auth.users au
      join auth.mfa_factors f on f.user_id = au.id
      where lower(au.email) = lower(u.email) and f.status::text = 'verified'
    )
  from public.app_users u
  where public.rr_is_admin()
  order by u.email
$$;
revoke all on function public.rr_team_two_step() from public, anon;
grant execute on function public.rr_team_two_step() to authenticated;

------------------------------------------------------------
-- 2. Error monitoring
------------------------------------------------------------
create table if not exists public.app_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'browser' check (kind in ('browser', 'crash', 'function')),
  message text not null check (char_length(message) between 1 and 1000),
  detail text not null default '' check (char_length(detail) <= 4000),
  page text not null default '' check (char_length(page) <= 500),
  user_email text not null default '',
  user_agent text not null default '' check (char_length(user_agent) <= 500),
  release text not null default '' check (char_length(release) <= 100)
);
create index if not exists idx_app_errors_created on public.app_errors (created_at desc);

-- The reporter is always the signed in person, whatever the browser sends.
create or replace function public.rr_app_errors_set_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null then
    select coalesce(lower(u.email), '') into new.user_email from auth.users u where u.id = auth.uid();
    new.user_email := coalesce(new.user_email, '');
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists rr_app_errors_user on public.app_errors;
create trigger rr_app_errors_user before insert on public.app_errors
  for each row execute function public.rr_app_errors_set_user();

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon;
revoke update on public.app_errors from authenticated;
grant select, insert, delete on public.app_errors to authenticated;
grant usage on sequence public.app_errors_id_seq to authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.app_errors;
drop policy if exists "Viewers read" on public.app_errors;

drop policy if exists "Team reports errors" on public.app_errors;
drop policy if exists "Admins read errors" on public.app_errors;
drop policy if exists "Admins clear errors" on public.app_errors;
create policy "Team reports errors" on public.app_errors
  for insert to authenticated with check (public.rr_is_member());
create policy "Admins read errors" on public.app_errors
  for select to authenticated using (public.rr_is_admin());
create policy "Admins clear errors" on public.app_errors
  for delete to authenticated using (public.rr_is_admin());

-- Keep 90 days. Call from the SQL editor or pg_cron:
--   select public.rr_app_errors_prune();
create or replace function public.rr_app_errors_prune(keep interval default interval '90 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.app_errors where created_at < now() - keep;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.rr_app_errors_prune(interval) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
