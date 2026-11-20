-- Mail page: each person's own Zoho mailbox connection (docs/mail.md).
--
-- One row per RR Central login. The Zoho refresh token is stored encrypted
-- (AES-GCM, key in the MAIL_TOKEN_KEY function secret, never in the database
-- or this repo) and only the mail-inbox Edge Function reads it, with the
-- service role. No policies: nobody signed in can read or change this table,
-- not even an admin, so no one can open another person's mailbox.
-- Safe to run more than once.

create table if not exists public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  user_email text not null,
  provider text not null default 'zoho' check (provider in ('zoho')),
  account_email text not null default '',
  zoho_account_id text not null default '',
  accounts_domain text not null default 'https://accounts.zoho.com',
  mail_domain text not null default 'https://mail.zoho.com',
  refresh_token_enc text not null,
  scopes text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_accounts_email_lower check (user_email = lower(user_email)),
  constraint mail_accounts_token_encrypted check (refresh_token_enc like 'v1:%')
);

create unique index if not exists mail_accounts_user_email_key on public.mail_accounts (user_email);

alter table public.mail_accounts enable row level security;
revoke all on public.mail_accounts from anon, authenticated;
drop policy if exists "Staff full access" on public.mail_accounts;
drop policy if exists "Viewers read" on public.mail_accounts;

notify pgrst, 'reload schema';
