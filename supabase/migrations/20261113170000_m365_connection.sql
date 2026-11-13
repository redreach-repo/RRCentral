-- Microsoft 365 mail + calendar Phase A connection (Mail.Send + Calendars.ReadWrite).
-- Refresh token is service-role only — same pattern as drive_connection / gmail_connection.
-- Safe to run more than once.

create table if not exists public.m365_connection (
  id smallint primary key default 1 check (id = 1),
  refresh_token text not null default '',
  account_email text not null default '',
  connected_by text not null default '',
  connected_at timestamptz not null default now()
);

alter table public.m365_connection enable row level security;
revoke all on public.m365_connection from anon, authenticated;
drop policy if exists "Staff full access" on public.m365_connection;
drop policy if exists "Viewers read" on public.m365_connection;

notify pgrst, 'reload schema';
