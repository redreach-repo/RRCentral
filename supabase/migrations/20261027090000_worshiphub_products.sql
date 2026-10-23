-- RR Central modules, Phase 5: Products section for WorshipHub.
--
-- WorshipHub is its own app with its own database. RR Central never copies
-- member, visitor or registration data. It only keeps one row per church
-- account with the account level details below, entered by hand, and reads
-- the live values through the `worshiphub-read` Edge Function when it is
-- configured (see docs/worshiphub-integration.md).
--
-- * `worship_church_profiles`: tenant slug, plan, modules, WhatsApp usage for
--   a month, billing status, renewal date and admin link, per church account.
-- * `rr_add_worshiphub_churches()`: dry run first setup that makes sure each
--   existing tenant has a church account. Undo with rr_undo_worshiphub_churches().
--
-- Adds new tables and functions only. Safe to re-run.
--
-- To reverse:
--   drop function if exists public.rr_undo_worshiphub_churches(uuid);
--   drop function if exists public.rr_add_worshiphub_churches(boolean, text[]);
--   drop table if exists public.worship_setup_log;
--   drop table if exists public.worship_church_profiles;

create table if not exists public.worship_church_profiles (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  tenant_slug text not null default '' check (tenant_slug ~ '^[a-z0-9-]*$'),
  plan text not null default '',
  modules text[] not null default '{}',
  -- Month the WhatsApp count is for, as YYYY-MM.
  whatsapp_month text not null default '' check (whatsapp_month = '' or whatsapp_month ~ '^\d{4}-\d{2}$'),
  whatsapp_conversations integer check (whatsapp_conversations >= 0),
  billing_status text not null default '' check (
    billing_status in ('', 'trial', 'active', 'past_due', 'paused', 'cancelled')
  ),
  renewal_date date,
  admin_url text not null default '' check (admin_url = '' or admin_url ~ '^https://'),
  notes text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists worship_church_profiles_slug_key
  on public.worship_church_profiles (tenant_slug) where tenant_slug <> '';

-- Which accounts the setup function created, so an apply can be undone.
create table if not exists public.worship_setup_log (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid not null,
  account_id uuid not null,
  created_account boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists worship_setup_log_batch_idx on public.worship_setup_log (batch_id);

alter table public.worship_church_profiles enable row level security;
alter table public.worship_setup_log enable row level security;
revoke all on public.worship_church_profiles from anon;
revoke all on public.worship_setup_log from anon, authenticated;
grant select, insert, update, delete on public.worship_church_profiles to authenticated;
-- Never the blanket policies 20260926090000_security_rls.sql adds on re-run.
drop policy if exists "Staff full access" on public.worship_church_profiles;
drop policy if exists "Viewers read" on public.worship_church_profiles;
drop policy if exists "Staff full access" on public.worship_setup_log;
drop policy if exists "Viewers read" on public.worship_setup_log;

drop policy if exists "Read church details on visible accounts" on public.worship_church_profiles;
drop policy if exists "Write church details on editable accounts" on public.worship_church_profiles;
create policy "Read church details on visible accounts" on public.worship_church_profiles
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Write church details on editable accounts" on public.worship_church_profiles
  for all to authenticated
  using (public.rr_can_write_account(account_id))
  with check (
    public.rr_can_write_account(account_id)
    and exists (select 1 from public.accounts a where a.id = account_id and a.type = 'worship_church')
  );

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.worship_church_profiles;
    create trigger rr_audit after insert or update or delete on public.worship_church_profiles
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

-- Make sure each WorshipHub tenant has a church account with its slug.
-- Dry run by default: returns what it would do and changes nothing.
--   select * from rr_add_worshiphub_churches();
--   select * from rr_add_worshiphub_churches(p_dry_run => false);
-- An existing church account is matched by slug, or by name with spaces and
-- punctuation dropped (ICOC UAE matches icoc-uae). Two matches are left alone.
create or replace function public.rr_add_worshiphub_churches(
  p_dry_run boolean default true,
  p_slugs text[] default array['icoc-uae', 'icoc-abu-dhabi']
)
returns table (slug text, action text, account_name text, account_reference text, batch_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  hits int;
  acc public.accounts%rowtype;
  batch uuid := gen_random_uuid();
  head text := 'AC-08-' || to_char(now(), 'YY');
  nextseq int;
  pretty text;
begin
  foreach s in array p_slugs loop
    slug := s;
    batch_id := case when p_dry_run then null else batch end;
    select count(*) into hits
    from public.accounts a
    left join public.worship_church_profiles p on p.account_id = a.id
    where a.type = 'worship_church'
      and (p.tenant_slug = s
        or regexp_replace(lower(a.name), '[^a-z0-9]', '', 'g') = replace(s, '-', ''));

    if hits > 1 then
      action := 'ambiguous, left alone';
      account_name := null;
      account_reference := null;
      return next;
      continue;
    end if;

    if hits = 1 then
      select a.* into acc
      from public.accounts a
      left join public.worship_church_profiles p on p.account_id = a.id
      where a.type = 'worship_church'
        and (p.tenant_slug = s
          or regexp_replace(lower(a.name), '[^a-z0-9]', '', 'g') = replace(s, '-', ''));
      account_name := acc.name;
      account_reference := acc.reference;
      if exists (select 1 from public.worship_church_profiles p where p.account_id = acc.id and p.tenant_slug = s) then
        action := 'already set up';
      elsif exists (select 1 from public.worship_church_profiles p where p.account_id = acc.id and p.tenant_slug <> '') then
        action := 'account has another slug, left alone';
      else
        action := 'add slug to existing account';
        if not p_dry_run then
          insert into public.worship_church_profiles (account_id, tenant_slug, updated_by)
          values (acc.id, s, 'setup script')
          on conflict (account_id) do update set tenant_slug = excluded.tenant_slug, updated_at = now();
          insert into public.worship_setup_log (batch_id, account_id, created_account) values (batch, acc.id, false);
        end if;
      end if;
      return next;
      continue;
    end if;

    -- No account yet: create one. ICOC slugs get ICOC in capitals.
    pretty := initcap(replace(s, '-', ' '));
    pretty := regexp_replace(pretty, '^Icoc\M', 'ICOC');
    pretty := regexp_replace(pretty, '\mUae\M', 'UAE');
    select coalesce(max(substring(a.reference from length(head) + 1 for 3)::int), 0) + 1 into nextseq
    from public.accounts a
    where a.reference ~ ('^' || head || '\d{3}');
    action := 'create church account';
    account_name := pretty;
    account_reference := head || lpad(nextseq::text, 3, '0');
    if not p_dry_run then
      insert into public.accounts (type, name, reference, status, source, created_by)
      values ('worship_church', pretty, account_reference, 'active', 'WorshipHub', 'setup script')
      returning * into acc;
      insert into public.worship_church_profiles (account_id, tenant_slug, updated_by)
      values (acc.id, s, 'setup script');
      insert into public.worship_setup_log (batch_id, account_id, created_account) values (batch, acc.id, true);
    end if;
    return next;
  end loop;
end;
$$;

-- Undo one apply: removes the accounts it created (and their church details)
-- and clears the slug it added to existing accounts. Returns rows touched.
create or replace function public.rr_undo_worshiphub_churches(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  m int := 0;
begin
  update public.worship_church_profiles p set tenant_slug = '', updated_at = now()
  from public.worship_setup_log l
  where l.batch_id = p_batch_id and not l.created_account and p.account_id = l.account_id;
  get diagnostics n = row_count;
  delete from public.accounts a
  using public.worship_setup_log l
  where l.batch_id = p_batch_id and l.created_account and a.id = l.account_id;
  get diagnostics m = row_count;
  delete from public.worship_setup_log where batch_id = p_batch_id;
  return n + m;
end;
$$;

-- SQL editor only.
revoke all on function public.rr_add_worshiphub_churches(boolean, text[]) from public, anon, authenticated;
revoke all on function public.rr_undo_worshiphub_churches(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
