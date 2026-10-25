-- Wave 5, PR X: the training and demo tracker. One row per session with a
-- CTRM Next client or prospect: type (Demo, Training, Workshop, Review),
-- date, who attended, topics covered and topics left (both from the list in
-- Settings), the recording link and when the follow up is due. My Day
-- reminds about follow ups that are due. Relationship facts only: never
-- trades, positions or prices. Safe to run more than once.

create table if not exists public.ctrm_sessions (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null default 'demo' check (kind in ('demo', 'training', 'workshop', 'review')),
  session_date date not null,
  attendees text not null default '' check (char_length(attendees) <= 1000),
  topics_covered text[] not null default '{}',
  topics_left text[] not null default '{}',
  recording_url text not null default '' check (recording_url = '' or recording_url ~* '^https?://'),
  follow_up_due date,
  follow_up_done boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 4000),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ctrm_sessions_account_idx on public.ctrm_sessions (account_id, session_date desc);
create index if not exists ctrm_sessions_follow_up_idx on public.ctrm_sessions (follow_up_due) where not follow_up_done;

alter table public.ctrm_sessions enable row level security;
revoke all on public.ctrm_sessions from anon;
grant select, insert, update, delete on public.ctrm_sessions to authenticated;
drop policy if exists "Staff full access" on public.ctrm_sessions;
drop policy if exists "Viewers read" on public.ctrm_sessions;

drop policy if exists "Read sessions on visible accounts" on public.ctrm_sessions;
create policy "Read sessions on visible accounts" on public.ctrm_sessions
  for select to authenticated using (public.rr_can_read_account(account_id));
drop policy if exists "Add sessions on editable accounts" on public.ctrm_sessions;
create policy "Add sessions on editable accounts" on public.ctrm_sessions
  for insert to authenticated with check (public.rr_can_write_account(account_id));
drop policy if exists "Edit sessions on editable accounts" on public.ctrm_sessions;
create policy "Edit sessions on editable accounts" on public.ctrm_sessions
  for update to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));
drop policy if exists "Managers delete sessions" on public.ctrm_sessions;
create policy "Managers delete sessions" on public.ctrm_sessions
  for delete to authenticated using (public.rr_is_manager_or_admin());

create or replace function public.rr_ctrm_session_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and current_user = 'authenticated' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists rr_ctrm_session_touch on public.ctrm_sessions;
create trigger rr_ctrm_session_touch before insert or update on public.ctrm_sessions
  for each row execute function public.rr_ctrm_session_touch();

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.ctrm_sessions;
    create trigger rr_audit after insert or update or delete on public.ctrm_sessions
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
