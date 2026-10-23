begin;

-- RR Central roadmap item 6: client portal.
--
-- portal_access: one private link per client contact. The link carries a
-- random token; only its SHA-256 hash is kept here. Clients never sign in to
-- Supabase and never read tables: the client-portal Edge Function looks the
-- hash up (service role) and returns only the portal view for that account.
--
-- The team that can edit an account manages its links. Changes no existing
-- data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.portal_access;

create table if not exists public.portal_access (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid references public.account_contacts(id) on delete set null,
  -- Who the link is for, e.g. the contact's name.
  label text not null default '',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index if not exists portal_access_account_idx on public.portal_access (account_id);

alter table public.portal_access enable row level security;
revoke all on public.portal_access from anon;
grant select, insert, update, delete on public.portal_access to authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.portal_access;
drop policy if exists "Viewers read" on public.portal_access;

drop policy if exists "Read portal links on visible accounts" on public.portal_access;
drop policy if exists "Manage portal links on editable accounts" on public.portal_access;
create policy "Read portal links on visible accounts" on public.portal_access
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Manage portal links on editable accounts" on public.portal_access
  for all to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.portal_access;
    create trigger rr_audit after insert or update or delete on public.portal_access
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
