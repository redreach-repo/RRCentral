-- Gmail + Google Calendar Phase A connection (send + calendar.events).
-- Refresh token is service-role only — same pattern as drive_connection.
-- Safe to run more than once.

create table if not exists public.gmail_connection (
  id smallint primary key default 1 check (id = 1),
  refresh_token text not null default '',
  account_email text not null default '',
  connected_by text not null default '',
  connected_at timestamptz not null default now()
);

alter table public.gmail_connection enable row level security;
revoke all on public.gmail_connection from anon, authenticated;
drop policy if exists "Staff full access" on public.gmail_connection;
drop policy if exists "Viewers read" on public.gmail_connection;
-- No policies: the refresh token is a key to the mailbox/calendar.

notify pgrst, 'reload schema';
