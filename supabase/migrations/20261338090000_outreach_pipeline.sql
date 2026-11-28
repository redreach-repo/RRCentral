-- Prospect outreach pipeline, Phase 1 (Alfred 2026-11-28).
--
-- Import CTRM Next prospects from a sheet, review each drafted email, approve
-- it, and send it one at a time from the person's own Zoho mailbox through
-- the existing mail-inbox function. Every send is logged against the
-- account, contact and CTRM deal.
--
-- Tables (all with tenant_id, row level security and soft delete):
--   outreach_settings        one row per company: daily cap (default 10),
--                            legal name, postal address, opt-out wording
--   outreach_senders         who sends (a team member and their mailbox) and
--                            their signature
--   outreach_templates       saved subject and body pairs (no UI yet)
--   outreach_import_batches  one uploaded sheet
--   outreach_import_rows     its rows, staged and checked before anything is made
--   outreach_messages        one email to one contact; status flow below
--   outreach_events          what happened to a message, without the email text
--   outreach_suppressions    addresses and domains we never email
--   external_blocklist       companies and domains already in CompMan or CTRM Next
-- Plus account_contacts.data_source and account_contacts.country.
--
-- Status flow of a message:
--   draft -> awaiting_approval -> approved | ready -> sending -> sent
--   -> replied | bounced | unsubscribed ; or rejected / passed at review.
--   draft is what the import makes. Any change to the recipient, subject or
--   body sends it back to awaiting_approval and clears the approval.
--   ready means approved and every pre-send check passed at that moment;
--   approved means approved but a check is still failing (blocked_reason).
--
-- Hard rules, enforced here and not only in the app:
--   * Only a signed in admin or manager, in a real sign in session, can
--     approve, edit, import or send. AI connector (MCP) sessions, API keys,
--     the service role on its own, and admin "View as user" sessions cannot.
--   * A message can only start sending when approved_by is the person
--     pressing Send and the stored hash of the exact recipient, subject and
--     body matches what they approved.
--   * Sends are one at a time per sender, under the daily cap, and never to
--     a suppressed address or domain.
--   * The audit log never holds the email subject or body.
--
-- Access: admin and manager read everything here; nobody writes the tables
-- directly (only through the rr_outreach_* functions below). Sales, staff,
-- viewers and AI connector keys see nothing.
--
-- Changes to existing data: none (two new nullable-default columns on
-- account_contacts). Safe to re-run.
-- Run after 20261335090000_admin_view_as.sql (uses rr_jwt_claim and view_as_sessions).
--
-- To reverse:
--   drop table if exists public.outreach_events, public.outreach_messages,
--     public.outreach_import_rows, public.outreach_import_batches,
--     public.outreach_templates, public.outreach_senders, public.outreach_settings,
--     public.outreach_suppressions, public.external_blocklist;
--   drop function if exists public.rr_outreach_* (each one);

set client_min_messages = warning;

do $$
begin
  if to_regclass('public.accounts') is null
     or to_regclass('public.account_contacts') is null
     or to_regclass('public.ctrm_deals') is null
     or to_regclass('public.mail_links') is null
     or to_regprocedure('public.rr_jwt_claim(text)') is null then
    raise exception 'Run the accounts, CTRM pipeline, mail links and admin view as SQL first (something is missing).';
  end if;
end $$;

------------------------------------------------------------
-- 0. Contacts: where the contact came from, and their country
------------------------------------------------------------
alter table public.account_contacts
  add column if not exists data_source text not null default '',
  add column if not exists country text not null default '';

comment on column public.account_contacts.data_source is
  'Where this contact came from (e.g. "Outreach import: prospects.xlsx").';
comment on column public.account_contacts.country is 'Country of the contact (from the outreach import).';

------------------------------------------------------------
-- 1. Tables
------------------------------------------------------------
create table if not exists public.outreach_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  daily_cap integer not null default 10 check (daily_cap between 1 and 200),
  company_legal_name text not null default '' check (char_length(company_legal_name) <= 200),
  company_address text not null default '' check (char_length(company_address) <= 500),
  opt_out_text text not null default
    'You are receiving this one-to-one email because of your role in commodity trading. If you would rather not hear from us, use this link and we will not email you again:'
    check (char_length(opt_out_text) <= 500),
  timezone text not null default 'Asia/Dubai',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists outreach_settings_tenant_key
  on public.outreach_settings (tenant_id) where deleted_at is null;

create table if not exists public.outreach_senders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  user_id uuid references public.app_users (id) on delete set null,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  display_name text not null default '' check (char_length(display_name) <= 120),
  signature text not null default '' check (char_length(signature) <= 2000),
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists outreach_senders_email_key
  on public.outreach_senders (tenant_id, email) where deleted_at is null;

create table if not exists public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  subject text not null default '' check (char_length(subject) <= 300),
  body text not null default '' check (char_length(body) <= 20000),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.outreach_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  file_name text not null default '' check (char_length(file_name) <= 200),
  status text not null default 'staged' check (status in ('staged', 'imported', 'cancelled')),
  row_count integer not null default 0,
  new_count integer not null default 0,
  enrichment_count integer not null default 0,
  duplicate_count integer not null default 0,
  blocked_count integer not null default 0,
  error_count integer not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  deleted_at timestamptz
);
create index if not exists outreach_import_batches_tenant_idx
  on public.outreach_import_batches (tenant_id, created_at desc);

create table if not exists public.outreach_import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  batch_id uuid not null references public.outreach_import_batches (id) on delete cascade,
  row_number integer not null,
  company text not null default '',
  contact_name text not null default '',
  title text not null default '',
  email text not null default '',
  country text not null default '',
  signal_used text not null default '',
  signal_url text not null default '',
  subject text not null default '',
  body text not null default '',
  send_from text not null default '',
  sheet_status text not null default '',
  checks_before_sending text not null default '',
  email_domain text not null default '',
  result text not null default 'new'
    check (result in ('new', 'needs_enrichment', 'duplicate', 'blocked', 'error')),
  reason text not null default '',
  account_id uuid references public.accounts (id) on delete set null,
  contact_id uuid references public.account_contacts (id) on delete set null,
  deal_id uuid references public.ctrm_deals (id) on delete set null,
  message_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (batch_id, row_number)
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  account_id uuid references public.accounts (id) on delete set null,
  contact_id uuid references public.account_contacts (id) on delete set null,
  deal_id uuid references public.ctrm_deals (id) on delete set null,
  sender_id uuid references public.outreach_senders (id) on delete set null,
  import_row_id uuid references public.outreach_import_rows (id) on delete set null,
  company text not null default '',
  to_name text not null default '',
  to_email text not null default '',
  subject text not null default '' check (char_length(subject) <= 300),
  body text not null default '' check (char_length(body) <= 20000),
  signal_used text not null default '',
  signal_url text not null default '',
  country text not null default '',
  data_source text not null default '',
  checks_note text not null default '',
  needs_enrichment boolean not null default false,
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_approval', 'approved', 'ready', 'sending', 'sent',
    'replied', 'bounced', 'unsubscribed', 'rejected', 'passed'
  )),
  blocked_reason text not null default '',
  approved_by uuid references public.app_users (id) on delete set null,
  approved_at timestamptz,
  approved_hash text,
  decided_reason text not null default '',
  send_started_at timestamptz,
  sent_at timestamptz,
  zoho_message_id text not null default '',
  unsub_token_hash text,
  last_error text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists outreach_messages_tenant_status_idx
  on public.outreach_messages (tenant_id, status, created_at desc) where deleted_at is null;
create index if not exists outreach_messages_account_idx on public.outreach_messages (account_id);
create index if not exists outreach_messages_email_idx on public.outreach_messages (lower(to_email));
create unique index if not exists outreach_messages_unsub_key
  on public.outreach_messages (unsub_token_hash) where unsub_token_hash is not null;

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  message_id uuid references public.outreach_messages (id) on delete cascade,
  event text not null check (event in (
    'created', 'edited', 'approved', 'rejected', 'passed', 'reset',
    'send_started', 'sent', 'send_failed', 'unsubscribed', 'bounced', 'replied'
  )),
  actor_email text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists outreach_events_message_idx on public.outreach_events (message_id, created_at);
create index if not exists outreach_events_sent_idx
  on public.outreach_events (tenant_id, created_at) where event = 'sent';

create table if not exists public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  kind text not null default 'email' check (kind in ('email', 'domain')),
  value text not null check (value = lower(value) and char_length(value) between 3 and 254),
  reason text not null default 'manual' check (reason in ('unsubscribed', 'bounced', 'complaint', 'manual')),
  source text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists outreach_suppressions_key
  on public.outreach_suppressions (tenant_id, kind, value) where deleted_at is null;

create table if not exists public.external_blocklist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  kind text not null check (kind in ('company', 'domain')),
  value text not null check (char_length(value) between 2 and 254),
  source text not null default 'other' check (source in ('compman', 'ctrm_next', 'other')),
  label text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists external_blocklist_key
  on public.external_blocklist (tenant_id, kind, value) where deleted_at is null;

comment on table public.outreach_messages is
  'Prospect outreach emails. Approved and sent only by a signed in admin or manager; see 20261338090000_outreach_pipeline.sql.';
comment on table public.external_blocklist is
  'Companies (normalised name) and email domains already in CompMan or CTRM Next. Imports skip them.';

------------------------------------------------------------
-- 2. Pure helpers
------------------------------------------------------------
-- "Al Noor Trading L.L.C." -> "al noor trading"; used to match companies.
create or replace function public.rr_outreach_norm_company(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p, '')), '[^a-z0-9\s&]+', ' ', 'g'),
      '\m(l\s*l\s*c|llc|fze|fzco|fz|dmcc|ltd|limited|inc|incorporated|plc|pvt|private|pte|co|corp|corporation|company|gmbh|ag|sa|bv|nv|llp|the|group|holding|holdings)\M',
      ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function public.rr_outreach_email_ok(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(btrim(p)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    and char_length(btrim(p)) <= 254, false)
$$;

create or replace function public.rr_outreach_domain(p text)
returns text
language sql
immutable
as $$
  select case when public.rr_outreach_email_ok(p) then split_part(lower(btrim(p)), '@', 2) else '' end
$$;

-- Free mail domains: never matched as "the same company".
create or replace function public.rr_outreach_free_domain(p text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p, '')) in (
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'hotmail.com',
    'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me',
    'protonmail.com', 'zoho.com', 'zohomail.com', 'gmx.com', 'mail.com', 'yandex.com',
    'rediffmail.com', 'qq.com', '163.com'
  )
$$;

-- info@, sales@ and the like reach nobody in particular: the row needs a named person.
create or replace function public.rr_outreach_generic_local(p text)
returns boolean
language sql
immutable
as $$
  select split_part(lower(btrim(coalesce(p, ''))), '@', 1) in (
    'info', 'sales', 'contact', 'contactus', 'enquiry', 'enquiries', 'inquiry', 'inquiries',
    'admin', 'office', 'hello', 'mail', 'support', 'marketing', 'general', 'team', 'trading',
    'hr', 'careers', 'jobs', 'accounts', 'finance', 'noreply', 'no-reply', 'webmaster'
  )
$$;

-- What is approved: the exact recipient, subject and body.
create or replace function public.rr_outreach_hash(p_to text, p_subject text, p_body text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(
    lower(btrim(coalesce(p_to, ''))) || chr(10) || coalesce(p_subject, '') || chr(10) || coalesce(p_body, ''),
    'UTF8')), 'hex')
$$;

------------------------------------------------------------
-- 3. Who may act: a real person, admin or manager
------------------------------------------------------------
-- True only for a signed in admin or manager in an ordinary sign in session:
-- not an AI connector token (hm_mcp_key / no session_id), not an admin
-- "View as user" session, not the service role or anon.
create or replace function public.rr_outreach_is_human_manager()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  sid text := public.rr_jwt_claim('session_id');
begin
  if auth.uid() is null or sid is null then
    return false;
  end if;
  if public.rr_jwt_claim('hm_mcp_key') is not null
     or coalesce(public.rr_jwt_claim('iss'), '') = 'highmast-mcp' then
    return false;
  end if;
  if to_regprocedure('public.rr_mcp_key_id()') is not null then
    if public.rr_mcp_key_id() is not null then
      return false;
    end if;
  end if;
  if exists (
    select 1 from public.view_as_sessions v
    where v.auth_session_id = sid and v.ended_at is null and v.expires_at > now()
  ) then
    return false;
  end if;
  return coalesce(public.rr_is_manager_or_admin(), false);
end $$;
revoke all on function public.rr_outreach_is_human_manager() from public, anon;
grant execute on function public.rr_outreach_is_human_manager() to authenticated;

create or replace function public.rr_outreach_require_human()
returns public.app_users
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  me public.app_users%rowtype;
begin
  if not public.rr_outreach_is_human_manager() then
    raise exception 'Only a signed in admin or manager can do this (not an AI key, API key or View as session).'
      using errcode = '42501';
  end if;
  select * into me from public.app_users where id = public.rr_current_user_id();
  if me.id is null or me.tenant_id is null then
    raise exception 'Your team member record was not found.' using errcode = '42501';
  end if;
  return me;
end $$;
revoke all on function public.rr_outreach_require_human() from public, anon, authenticated;

------------------------------------------------------------
-- 4. Message guard: approvals cannot be forged or kept after an edit
------------------------------------------------------------
create or replace function public.rr_outreach_message_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  content_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'awaiting_approval', 'passed', 'rejected') then
      raise exception 'A new outreach email starts as a draft.';
    end if;
    new.approved_by := null;
    new.approved_at := null;
    new.approved_hash := null;
    new.to_email := lower(btrim(new.to_email));
    return new;
  end if;

  new.to_email := lower(btrim(new.to_email));
  new.updated_at := now();
  content_changed := new.to_email is distinct from old.to_email
    or new.subject is distinct from old.subject
    or new.body is distinct from old.body;

  if content_changed then
    if old.status in ('sending', 'sent', 'replied', 'bounced', 'unsubscribed') then
      raise exception 'This email has already been sent; it cannot be changed.';
    end if;
    -- Any edit needs a fresh approval.
    new.status := 'awaiting_approval';
    new.approved_by := null;
    new.approved_at := null;
    new.approved_hash := null;
    new.blocked_reason := '';
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('approved', 'ready') then
      if new.approved_by is null or new.approved_hash is null
         or new.approved_hash <> public.rr_outreach_hash(new.to_email, new.subject, new.body) then
        raise exception 'An outreach email can only be approved by a person, for its exact text.';
      end if;
      if old.status not in ('draft', 'awaiting_approval', 'approved', 'ready', 'sending') then
        raise exception 'This email cannot be approved from %.', old.status;
      end if;
    elsif new.status = 'sending' then
      if old.status not in ('approved', 'ready')
         or new.approved_hash is null
         or new.approved_hash <> public.rr_outreach_hash(new.to_email, new.subject, new.body) then
        raise exception 'Only an approved, unchanged email can be sent.';
      end if;
    elsif new.status = 'sent' then
      if old.status <> 'sending' then
        raise exception 'Only an email that is being sent can be marked sent.';
      end if;
    elsif new.status in ('replied', 'bounced') then
      if old.status not in ('sent', 'replied', 'bounced', 'unsubscribed') then
        raise exception 'Only a sent email can be marked %.', new.status;
      end if;
    elsif new.status in ('draft', 'awaiting_approval', 'rejected', 'passed') then
      if old.status in ('sending', 'sent', 'replied', 'bounced', 'unsubscribed') then
        raise exception 'This email has already been sent.';
      end if;
      new.approved_by := null;
      new.approved_at := null;
      new.approved_hash := null;
    end if;
  elsif new.status in ('approved', 'ready')
     and (new.approved_by is distinct from old.approved_by or new.approved_hash is distinct from old.approved_hash) then
    if new.approved_by is null or new.approved_hash is null
       or new.approved_hash <> public.rr_outreach_hash(new.to_email, new.subject, new.body) then
      raise exception 'An outreach email can only be approved by a person, for its exact text.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.rr_outreach_message_guard() from public;

drop trigger if exists rr_outreach_message_guard on public.outreach_messages;
create trigger rr_outreach_message_guard before insert or update on public.outreach_messages
  for each row execute function public.rr_outreach_message_guard();

------------------------------------------------------------
-- 5. Audit log, without the email text
------------------------------------------------------------
create or replace function public.rr_outreach_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  hide text[] := array['subject', 'body', 'unsub_token_hash', 'approved_hash'];
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - hide end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - hide end;
  changed text[] := '{}';
  actor text;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into changed
    from jsonb_object_keys(to_jsonb(new)) k
    where k not in ('updated_at')
      and to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
    if array_length(changed, 1) is null then
      return new;
    end if;
  end if;
  select lower(u.email) into actor from auth.users u where u.id = auth.uid();
  insert into public.audit_log (table_name, operation, row_id, actor_email, changed_fields, old_data, new_data)
  values (
    tg_table_name, tg_op, coalesce(new_j ->> 'id', old_j ->> 'id', ''),
    coalesce(actor, case when auth.role() = 'anon' then 'anonymous' else 'system' end),
    changed, old_j, new_j
  );
  return coalesce(new, old);
end $$;
revoke all on function public.rr_outreach_audit() from public;

------------------------------------------------------------
-- 6. Row level security: admin and manager read, nobody writes directly
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'outreach_settings', 'outreach_senders', 'outreach_templates', 'outreach_import_batches',
    'outreach_import_rows', 'outreach_messages', 'outreach_events', 'outreach_suppressions',
    'external_blocklist'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Authenticated users full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);

    execute format('drop policy if exists "Managers read" on public.%I', t);
    execute format(
      'create policy "Managers read" on public.%I for select to authenticated
         using (public.rr_is_manager_or_admin())', t);

    execute format('drop policy if exists "Tenant isolation" on public.%I', t);
    execute format(
      'create policy "Tenant isolation" on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id))', t);

    if to_regprocedure('public.rr_mcp_key_id()') is not null then
      execute format('drop policy if exists "AI never touches outreach" on public.%I', t);
      execute format(
        'create policy "AI never touches outreach" on public.%I as restrictive for all to authenticated
           using (public.rr_mcp_key_id() is null) with check (public.rr_mcp_key_id() is null)', t);
    end if;
  end loop;

  foreach t in array array[
    'outreach_settings', 'outreach_senders', 'outreach_messages', 'outreach_suppressions', 'external_blocklist'
  ] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format('drop trigger if exists rr_outreach_audit on public.%I', t);
    execute format(
      'create trigger rr_outreach_audit after insert or update or delete on public.%I
         for each row execute function public.rr_outreach_audit()', t);
  end loop;
end $$;

------------------------------------------------------------
-- 7. Settings and senders
------------------------------------------------------------
-- The company's settings row (made on first use). Read by the page and the send.
create or replace function public.rr_outreach_settings_row(p_tenant uuid)
returns public.outreach_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.outreach_settings%rowtype;
begin
  select * into s from public.outreach_settings where tenant_id = p_tenant and deleted_at is null limit 1;
  if s.id is null then
    insert into public.outreach_settings (tenant_id) values (p_tenant)
    on conflict do nothing;
    select * into s from public.outreach_settings where tenant_id = p_tenant and deleted_at is null limit 1;
  end if;
  return s;
end $$;
revoke all on function public.rr_outreach_settings_row(uuid) from public, anon, authenticated;

create or replace function public.rr_outreach_save_settings(
  p_daily_cap integer,
  p_legal_name text,
  p_address text,
  p_opt_out_text text
)
returns public.outreach_settings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  s public.outreach_settings := public.rr_outreach_settings_row(me.tenant_id);
begin
  if p_daily_cap is null or p_daily_cap < 1 or p_daily_cap > 200 then
    raise exception 'The daily cap must be between 1 and 200.';
  end if;
  if btrim(coalesce(p_opt_out_text, '')) = '' then
    raise exception 'Keep an opt-out line; every email needs one.';
  end if;
  update public.outreach_settings
  set daily_cap = p_daily_cap,
      company_legal_name = btrim(coalesce(p_legal_name, '')),
      company_address = btrim(coalesce(p_address, '')),
      opt_out_text = btrim(p_opt_out_text),
      updated_by = coalesce(public.rr_current_email(), ''),
      updated_at = now()
  where id = s.id
  returning * into s;
  return s;
end $$;
revoke all on function public.rr_outreach_save_settings(integer, text, text, text) from public, anon;
grant execute on function public.rr_outreach_save_settings(integer, text, text, text) to authenticated;

-- Default signature, editable per sender.
create or replace function public.rr_outreach_default_signature(p_name text, p_company text, p_email text)
returns text
language sql
immutable
as $$
  select concat_ws(chr(10),
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(p_company, '')), ''),
    'On behalf of CTRM Next',
    nullif(lower(btrim(coalesce(p_email, ''))), ''))
$$;

-- The sender row for a team member (made with the default signature when missing).
create or replace function public.rr_outreach_sender_for(p_user public.app_users)
returns public.outreach_senders
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.outreach_senders%rowtype;
  s public.outreach_settings := public.rr_outreach_settings_row(p_user.tenant_id);
begin
  select * into r from public.outreach_senders
  where tenant_id = p_user.tenant_id and email = lower(p_user.email) and deleted_at is null
  limit 1;
  if r.id is null then
    insert into public.outreach_senders (tenant_id, user_id, email, display_name, signature, created_by)
    values (
      p_user.tenant_id, p_user.id, lower(p_user.email), coalesce(nullif(btrim(p_user.name), ''), p_user.email),
      public.rr_outreach_default_signature(coalesce(nullif(btrim(p_user.name), ''), p_user.email),
        coalesce(nullif(s.company_legal_name, ''), 'Red Reach Middle East FZE'), p_user.email),
      coalesce(public.rr_current_email(), '')
    )
    returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.rr_outreach_sender_for(public.app_users) from public, anon, authenticated;

create or replace function public.rr_outreach_my_sender()
returns public.outreach_senders
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
begin
  return public.rr_outreach_sender_for(me);
end $$;
revoke all on function public.rr_outreach_my_sender() from public, anon;
grant execute on function public.rr_outreach_my_sender() to authenticated;

-- A person edits their own sender name and signature (admins any sender).
create or replace function public.rr_outreach_save_sender(p_id uuid, p_display_name text, p_signature text, p_active boolean default true)
returns public.outreach_senders
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  r public.outreach_senders%rowtype;
begin
  select * into r from public.outreach_senders
  where id = p_id and tenant_id = me.tenant_id and deleted_at is null for update;
  if r.id is null then
    raise exception 'That sender was not found.';
  end if;
  if r.email <> lower(me.email) and me.role <> 'admin' then
    raise exception 'You can only change your own signature.';
  end if;
  if btrim(coalesce(p_signature, '')) = '' then
    raise exception 'A signature is needed: it says who is writing.';
  end if;
  update public.outreach_senders
  set display_name = left(btrim(coalesce(p_display_name, '')), 120),
      signature = left(btrim(p_signature), 2000),
      active = coalesce(p_active, true),
      updated_at = now()
  where id = r.id
  returning * into r;
  return r;
end $$;
revoke all on function public.rr_outreach_save_sender(uuid, text, text, boolean) from public, anon;
grant execute on function public.rr_outreach_save_sender(uuid, text, text, boolean) to authenticated;

------------------------------------------------------------
-- 8. Blocklist and suppressions
------------------------------------------------------------
-- Load CompMan / CTRM Next companies and domains from a CSV the page has read:
-- p_rows = [{"company": "...", "domain": "..."}, ...]. Returns how many were added.
create or replace function public.rr_outreach_blocklist_load(p_source text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  r jsonb;
  v_company text;
  v_domain text;
  added integer := 0;
  n integer;
begin
  if p_source not in ('compman', 'ctrm_next', 'other') then
    raise exception 'Pick where the list comes from (CompMan or CTRM Next).';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then
    raise exception 'Send at most 20,000 rows at a time.';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_company := public.rr_outreach_norm_company(r ->> 'company');
    v_domain := lower(btrim(coalesce(r ->> 'domain', '')));
    v_domain := regexp_replace(regexp_replace(v_domain, '^(https?://)?(www\.)?', ''), '[/@].*$', '');
    if position('@' in coalesce(r ->> 'domain', '')) > 0 then
      v_domain := public.rr_outreach_domain(r ->> 'domain');
    end if;
    if char_length(v_company) >= 2 then
      insert into public.external_blocklist (tenant_id, kind, value, source, label, created_by)
      values (me.tenant_id, 'company', v_company, p_source, left(coalesce(r ->> 'company', ''), 200), lower(me.email))
      on conflict do nothing;
      get diagnostics n = row_count;
      added := added + n;
    end if;
    if v_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$' and not public.rr_outreach_free_domain(v_domain) then
      insert into public.external_blocklist (tenant_id, kind, value, source, label, created_by)
      values (me.tenant_id, 'domain', v_domain, p_source, left(coalesce(r ->> 'company', ''), 200), lower(me.email))
      on conflict do nothing;
      get diagnostics n = row_count;
      added := added + n;
    end if;
  end loop;
  return jsonb_build_object('added', added);
end $$;
revoke all on function public.rr_outreach_blocklist_load(text, jsonb) from public, anon;
grant execute on function public.rr_outreach_blocklist_load(text, jsonb) to authenticated;

create or replace function public.rr_outreach_is_suppressed(p_tenant uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.outreach_suppressions s
    where s.tenant_id = p_tenant and s.deleted_at is null
      and ((s.kind = 'email' and s.value = lower(btrim(p_email)))
        or (s.kind = 'domain' and s.value = public.rr_outreach_domain(p_email)))
  )
$$;
revoke all on function public.rr_outreach_is_suppressed(uuid, text) from public, anon, authenticated;

create or replace function public.rr_outreach_suppress(p_value text, p_reason text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  v text := lower(btrim(coalesce(p_value, '')));
  k text;
begin
  if public.rr_outreach_email_ok(v) then
    k := 'email';
  elsif v ~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
    k := 'domain';
  else
    raise exception 'Type an email address or a domain.';
  end if;
  insert into public.outreach_suppressions (tenant_id, kind, value, reason, source, created_by)
  values (me.tenant_id, k, v, coalesce(nullif(p_reason, ''), 'manual'), 'added by hand', lower(me.email))
  on conflict do nothing;
  return jsonb_build_object('kind', k, 'value', v);
end $$;
revoke all on function public.rr_outreach_suppress(text, text) from public, anon;
grant execute on function public.rr_outreach_suppress(text, text) to authenticated;

------------------------------------------------------------
-- 9. Import: stage and check the rows, then create
------------------------------------------------------------
-- p_rows: [{company, contact_name, title, email, country, signal_used, signal_url,
--           subject, body, send_from, status, checks}, ...] as read from the sheet.
create or replace function public.rr_outreach_import_stage(p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  b public.outreach_import_batches%rowtype;
  r jsonb;
  i integer := 0;
  v_company text;
  v_norm text;
  v_email text;
  v_domain text;
  v_result text;
  v_reason text;
  seen_company text[] := '{}';
  seen_email text[] := '{}';
  seen_domain text[] := '{}';
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The sheet could not be read.';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'The sheet has no rows.';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import at most 2,000 rows at a time.';
  end if;

  insert into public.outreach_import_batches (tenant_id, file_name, created_by)
  values (me.tenant_id, left(btrim(coalesce(p_file_name, '')), 200), lower(me.email))
  returning * into b;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_company := left(btrim(coalesce(r ->> 'company', '')), 200);
    v_norm := public.rr_outreach_norm_company(v_company);
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    v_domain := public.rr_outreach_domain(v_email);
    v_result := 'new';
    v_reason := '';

    if v_company = '' or v_norm = '' then
      v_result := 'error';
      v_reason := 'No company name';
    elsif v_email <> '' and not public.rr_outreach_email_ok(v_email) then
      v_result := 'error';
      v_reason := 'Email address is not valid';
    elsif v_norm = any (seen_company) then
      v_result := 'duplicate';
      v_reason := 'Same company earlier in this sheet';
    elsif v_email <> '' and v_email = any (seen_email) then
      v_result := 'duplicate';
      v_reason := 'Same email earlier in this sheet';
    elsif v_domain <> '' and not public.rr_outreach_free_domain(v_domain) and v_domain = any (seen_domain) then
      v_result := 'duplicate';
      v_reason := 'Same email domain earlier in this sheet';
    elsif exists (
      select 1 from public.external_blocklist x
      where x.tenant_id = me.tenant_id and x.deleted_at is null
        and ((x.kind = 'company' and x.value = v_norm) or (x.kind = 'domain' and v_domain <> '' and x.value = v_domain))
    ) then
      v_result := 'blocked';
      v_reason := (
        select 'Already in ' || case x.source when 'compman' then 'CompMan' when 'ctrm_next' then 'CTRM Next' else 'the blocklist' end
        from public.external_blocklist x
        where x.tenant_id = me.tenant_id and x.deleted_at is null
          and ((x.kind = 'company' and x.value = v_norm) or (x.kind = 'domain' and v_domain <> '' and x.value = v_domain))
        limit 1);
    elsif v_email <> '' and public.rr_outreach_is_suppressed(me.tenant_id, v_email) then
      v_result := 'blocked';
      v_reason := 'Address or domain is on the do-not-email list';
    elsif exists (
      select 1 from public.accounts a
      where a.tenant_id = me.tenant_id and a.deleted_at is null
        and public.rr_outreach_norm_company(a.name) = v_norm
    ) then
      v_result := 'duplicate';
      v_reason := 'Company is already a client or prospect';
    elsif v_email <> '' and exists (
      select 1 from public.account_contacts c
      where c.tenant_id = me.tenant_id and c.deleted_at is null and lower(btrim(c.email)) = v_email
    ) then
      v_result := 'duplicate';
      v_reason := 'Contact email is already in the CRM';
    elsif v_domain <> '' and not public.rr_outreach_free_domain(v_domain) and exists (
      select 1 from public.account_contacts c
      join public.accounts a on a.id = c.account_id and a.deleted_at is null
      where c.tenant_id = me.tenant_id and c.deleted_at is null and public.rr_outreach_domain(c.email) = v_domain
    ) then
      v_result := 'duplicate';
      v_reason := 'A company with this email domain is already in the CRM';
    elsif v_email = '' then
      v_result := 'needs_enrichment';
      v_reason := 'No email address: find the right person first';
    elsif public.rr_outreach_generic_local(v_email) then
      v_result := 'needs_enrichment';
      v_reason := 'Only a general address (' || split_part(v_email, '@', 1) || '@): find a named person';
    end if;

    if v_result not in ('error') then
      seen_company := seen_company || v_norm;
      if v_email <> '' then seen_email := seen_email || v_email; end if;
      if v_domain <> '' then seen_domain := seen_domain || v_domain; end if;
    end if;

    insert into public.outreach_import_rows (
      tenant_id, batch_id, row_number, company, contact_name, title, email, country,
      signal_used, signal_url, subject, body, send_from, sheet_status, checks_before_sending,
      email_domain, result, reason
    ) values (
      me.tenant_id, b.id, i, v_company,
      left(btrim(coalesce(r ->> 'contact_name', '')), 200),
      left(btrim(coalesce(r ->> 'title', '')), 200),
      left(v_email, 254),
      left(btrim(coalesce(r ->> 'country', '')), 100),
      left(btrim(coalesce(r ->> 'signal_used', '')), 1000),
      left(btrim(coalesce(r ->> 'signal_url', '')), 1000),
      left(btrim(coalesce(r ->> 'subject', '')), 300),
      left(coalesce(r ->> 'body', ''), 20000),
      left(lower(btrim(coalesce(r ->> 'send_from', ''))), 254),
      left(btrim(coalesce(r ->> 'status', '')), 100),
      left(btrim(coalesce(r ->> 'checks', '')), 2000),
      v_domain, v_result, v_reason
    );
  end loop;

  update public.outreach_import_batches x
  set row_count = i,
      new_count = (select count(*) from public.outreach_import_rows where batch_id = b.id and result = 'new'),
      enrichment_count = (select count(*) from public.outreach_import_rows where batch_id = b.id and result = 'needs_enrichment'),
      duplicate_count = (select count(*) from public.outreach_import_rows where batch_id = b.id and result = 'duplicate'),
      blocked_count = (select count(*) from public.outreach_import_rows where batch_id = b.id and result = 'blocked'),
      error_count = (select count(*) from public.outreach_import_rows where batch_id = b.id and result = 'error')
  where x.id = b.id
  returning * into b;

  return to_jsonb(b);
end $$;
revoke all on function public.rr_outreach_import_stage(text, jsonb) from public, anon;
grant execute on function public.rr_outreach_import_stage(text, jsonb) to authenticated;

-- Create a prospect account, contact, CTRM deal and draft email for every new
-- (and needs enrichment) row of a staged sheet. Duplicates, blocked and
-- error rows are left alone.
create or replace function public.rr_outreach_import_commit(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  b public.outreach_import_batches%rowtype;
  row_ public.outreach_import_rows%rowtype;
  my_sender public.outreach_senders := public.rr_outreach_sender_for(me);
  v_sender uuid;
  v_ref text;
  v_account uuid;
  v_contact uuid;
  v_deal uuid;
  v_message uuid;
  v_source text;
  v_status text;
  made integer := 0;
  tries integer;
begin
  select * into b from public.outreach_import_batches
  where id = p_batch_id and tenant_id = me.tenant_id and deleted_at is null for update;
  if b.id is null then
    raise exception 'That import was not found.';
  end if;
  if b.status <> 'staged' then
    raise exception 'That import has already been used.';
  end if;
  v_source := 'Outreach import: ' || coalesce(nullif(b.file_name, ''), 'sheet');

  for row_ in
    select * from public.outreach_import_rows
    where batch_id = b.id and result in ('new', 'needs_enrichment') and deleted_at is null
    order by row_number
  loop
    -- Unique account reference AC-09-YYnnnn (CTRM Next prospects).
    tries := 0;
    loop
      tries := tries + 1;
      v_ref := public.rr_allocate_reference('account', '09', 'AC');
      exit when not exists (select 1 from public.accounts where reference = v_ref) or tries > 50;
    end loop;

    insert into public.accounts (type, name, reference, country, website, status, owner_user_id, source, notes, created_by, tenant_id)
    values (
      'ctrm_prospect', row_.company, v_ref, row_.country,
      case when row_.email_domain <> '' and not public.rr_outreach_free_domain(row_.email_domain) then row_.email_domain else '' end,
      'active', me.id, v_source, '', lower(me.email), me.tenant_id
    )
    returning id into v_account;

    insert into public.account_contacts (account_id, name, role, email, is_primary, data_source, country, tenant_id)
    values (v_account, row_.contact_name, row_.title, row_.email, true, v_source, row_.country, me.tenant_id)
    returning id into v_contact;

    insert into public.ctrm_deals (
      account_id, stage, region, company_type, primary_contact_id, source, owner_user_id,
      next_action, next_action_date, notes, created_by, tenant_id
    ) values (
      v_account, 'identified',
      case when lower(row_.country) in ('india', 'in') then 'india' else 'middle_east' end,
      'other', v_contact, 'outreach', me.id,
      case when row_.result = 'needs_enrichment' then 'Find a named contact, then review the outreach email'
           else 'Review and send the outreach email' end,
      current_date, '', lower(me.email), me.tenant_id
    )
    returning id into v_deal;

    v_sender := my_sender.id;
    if row_.send_from <> '' and row_.send_from <> my_sender.email then
      select s.id into v_sender from public.outreach_senders s
      where s.tenant_id = me.tenant_id and s.email = row_.send_from and s.deleted_at is null limit 1;
      v_sender := coalesce(v_sender, my_sender.id);
    end if;

    v_status := case when lower(row_.sheet_status) ~ '^(skip|pass|passed|do not send|dont send|hold)' then 'passed' else 'draft' end;

    insert into public.outreach_messages (
      tenant_id, account_id, contact_id, deal_id, sender_id, import_row_id, company,
      to_name, to_email, subject, body, signal_used, signal_url, country, data_source,
      checks_note, needs_enrichment, status, created_by
    ) values (
      me.tenant_id, v_account, v_contact, v_deal, v_sender, row_.id, row_.company,
      row_.contact_name, row_.email, row_.subject, row_.body, row_.signal_used, row_.signal_url,
      row_.country, v_source, row_.checks_before_sending, row_.result = 'needs_enrichment',
      v_status, lower(me.email)
    )
    returning id into v_message;

    insert into public.outreach_events (tenant_id, message_id, event, actor_email, detail)
    values (me.tenant_id, v_message, 'created', lower(me.email),
      jsonb_build_object('batch_id', b.id, 'row', row_.row_number, 'needs_enrichment', row_.result = 'needs_enrichment'));

    insert into public.account_activities (account_id, user_id, user_email, kind, body, tenant_id)
    values (v_account, me.id, lower(me.email), 'system',
      'Added from the outreach import (' || coalesce(nullif(b.file_name, ''), 'sheet') || ')'
        || case when row_.signal_used <> '' then '. Signal: ' || left(row_.signal_used, 300) else '' end,
      me.tenant_id);

    update public.outreach_import_rows
    set account_id = v_account, contact_id = v_contact, deal_id = v_deal, message_id = v_message
    where id = row_.id;
    made := made + 1;
  end loop;

  update public.outreach_import_batches
  set status = 'imported', imported_at = now()
  where id = b.id;

  return jsonb_build_object('batch_id', b.id, 'created', made);
end $$;
revoke all on function public.rr_outreach_import_commit(uuid) from public, anon;
grant execute on function public.rr_outreach_import_commit(uuid) to authenticated;

------------------------------------------------------------
-- 10. Review: edit, approve, reject, pass
------------------------------------------------------------
create or replace function public.rr_outreach_edit(p_id uuid, p_to_email text, p_subject text, p_body text)
returns public.outreach_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  m public.outreach_messages%rowtype;
  v_email text := lower(btrim(coalesce(p_to_email, '')));
begin
  select * into m from public.outreach_messages
  where id = p_id and tenant_id = me.tenant_id and deleted_at is null for update;
  if m.id is null then
    raise exception 'That email was not found.';
  end if;
  if v_email <> '' and not public.rr_outreach_email_ok(v_email) then
    raise exception 'That is not an email address.';
  end if;
  update public.outreach_messages
  set to_email = v_email,
      subject = left(regexp_replace(coalesce(p_subject, ''), '[\r\n\t]+', ' ', 'g'), 300),
      body = left(coalesce(p_body, ''), 20000),
      needs_enrichment = (v_email = '' or public.rr_outreach_generic_local(v_email))
  where id = m.id
  returning * into m;
  insert into public.outreach_events (tenant_id, message_id, event, actor_email)
  values (me.tenant_id, m.id, 'edited', lower(me.email));
  if m.contact_id is not null and v_email <> '' then
    update public.account_contacts set email = v_email
    where id = m.contact_id and btrim(email) = '';
  end if;
  return m;
end $$;
revoke all on function public.rr_outreach_edit(uuid, text, text, text) from public, anon;
grant execute on function public.rr_outreach_edit(uuid, text, text, text) to authenticated;

-- What stops this email going out right now; '' when nothing does.
create or replace function public.rr_outreach_blocker(m public.outreach_messages)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.outreach_settings%rowtype;
  snd public.outreach_senders%rowtype;
begin
  if not public.rr_outreach_email_ok(m.to_email) then
    return 'No valid email address';
  end if;
  if public.rr_outreach_generic_local(m.to_email) then
    return 'Only a general address: find a named person';
  end if;
  if public.rr_outreach_is_suppressed(m.tenant_id, m.to_email) then
    return 'This address or domain asked not to be emailed';
  end if;
  if btrim(m.subject) = '' or btrim(m.body) = '' then
    return 'Subject and body are both needed';
  end if;
  select * into snd from public.outreach_senders where id = m.sender_id and deleted_at is null;
  if snd.id is null or not snd.active then
    return 'No active sender';
  end if;
  if btrim(snd.signature) = '' then
    return 'The sender has no signature';
  end if;
  select * into s from public.outreach_settings where tenant_id = m.tenant_id and deleted_at is null limit 1;
  if s.id is null or btrim(s.company_address) = '' or btrim(s.company_legal_name) = '' then
    return 'Add the company legal name and postal address in Outreach settings';
  end if;
  return '';
end $$;
revoke all on function public.rr_outreach_blocker(public.outreach_messages) from public, anon, authenticated;

create or replace function public.rr_outreach_decide(p_id uuid, p_decision text, p_reason text default '')
returns public.outreach_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  m public.outreach_messages%rowtype;
  blocker text;
begin
  select * into m from public.outreach_messages
  where id = p_id and tenant_id = me.tenant_id and deleted_at is null for update;
  if m.id is null then
    raise exception 'That email was not found.';
  end if;
  if m.status in ('sending', 'sent', 'replied', 'bounced', 'unsubscribed') then
    raise exception 'This email has already been sent.';
  end if;

  if p_decision = 'approve' then
    if btrim(m.subject) = '' or btrim(m.body) = '' then
      raise exception 'Write a subject and a body before approving.';
    end if;
    if not public.rr_outreach_email_ok(m.to_email) then
      raise exception 'Add the contact''s email address before approving.';
    end if;
    blocker := public.rr_outreach_blocker(m);
    update public.outreach_messages
    set status = case when blocker = '' then 'ready' else 'approved' end,
        approved_by = me.id,
        approved_at = now(),
        approved_hash = public.rr_outreach_hash(m.to_email, m.subject, m.body),
        blocked_reason = blocker,
        decided_reason = left(coalesce(p_reason, ''), 500),
        last_error = ''
    where id = m.id
    returning * into m;
    insert into public.outreach_events (tenant_id, message_id, event, actor_email, detail)
    values (me.tenant_id, m.id, 'approved', lower(me.email), jsonb_build_object('blocked_reason', blocker));
  elsif p_decision in ('reject', 'pass') then
    update public.outreach_messages
    set status = case p_decision when 'reject' then 'rejected' else 'passed' end,
        decided_reason = left(coalesce(p_reason, ''), 500),
        blocked_reason = ''
    where id = m.id
    returning * into m;
    insert into public.outreach_events (tenant_id, message_id, event, actor_email, detail)
    values (me.tenant_id, m.id, case p_decision when 'reject' then 'rejected' else 'passed' end, lower(me.email),
      jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
  elsif p_decision = 'reopen' then
    update public.outreach_messages
    set status = 'awaiting_approval', blocked_reason = ''
    where id = m.id
    returning * into m;
    insert into public.outreach_events (tenant_id, message_id, event, actor_email)
    values (me.tenant_id, m.id, 'reset', lower(me.email));
  else
    raise exception 'Unknown decision.';
  end if;
  return m;
end $$;
revoke all on function public.rr_outreach_decide(uuid, text, text) from public, anon;
grant execute on function public.rr_outreach_decide(uuid, text, text) to authenticated;

------------------------------------------------------------
-- 11. Send: claim (as the person), then finish (server only)
------------------------------------------------------------
-- Sent today (in the company's time zone), counting emails being sent now.
create or replace function public.rr_outreach_sent_today(p_tenant uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(*) from public.outreach_events e
    where e.tenant_id = p_tenant and e.event = 'sent'
      and e.created_at >= (date_trunc('day', now() at time zone coalesce(
        (select timezone from public.outreach_settings where tenant_id = p_tenant and deleted_at is null limit 1),
        'Asia/Dubai')) at time zone coalesce(
        (select timezone from public.outreach_settings where tenant_id = p_tenant and deleted_at is null limit 1),
        'Asia/Dubai'))
  )::integer + (
    select count(*) from public.outreach_messages m
    where m.tenant_id = p_tenant and m.status = 'sending' and m.deleted_at is null
  )::integer
$$;
revoke all on function public.rr_outreach_sent_today(uuid) from public, anon, authenticated;

create or replace function public.rr_outreach_today()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  t uuid := public.rr_my_tenant_id();
  s public.outreach_settings;
begin
  if not coalesce(public.rr_is_manager_or_admin(), false) or t is null then
    raise exception 'Only an admin or manager can see outreach.' using errcode = '42501';
  end if;
  s := public.rr_outreach_settings_row(t);
  return jsonb_build_object('sent_today', public.rr_outreach_sent_today(t), 'daily_cap', s.daily_cap);
end $$;
revoke all on function public.rr_outreach_today() from public, anon;
grant execute on function public.rr_outreach_today() to authenticated;

-- Called by the mail-inbox function WITH THE PERSON'S OWN SIGN IN TOKEN when
-- they press Send. Every rule is checked here; the email moves to "sending"
-- and what to send comes back, with a fresh unsubscribe token.
create or replace function public.rr_outreach_claim_send(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  m public.outreach_messages%rowtype;
  s public.outreach_settings;
  snd public.outreach_senders%rowtype;
  blocker text;
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  s := public.rr_outreach_settings_row(me.tenant_id);
  -- One send at a time per company: the settings row is the lock.
  perform 1 from public.outreach_settings where id = s.id for update;

  select * into m from public.outreach_messages
  where id = p_id and tenant_id = me.tenant_id and deleted_at is null for update;
  if m.id is null then
    raise exception 'That email was not found.';
  end if;
  if m.status not in ('approved', 'ready') then
    raise exception 'Only an approved email can be sent (this one is %).', replace(m.status, '_', ' ');
  end if;
  if m.approved_by is distinct from me.id then
    raise exception 'You can only send an email you approved yourself. Approve it first.';
  end if;
  if m.approved_hash is null or m.approved_hash <> public.rr_outreach_hash(m.to_email, m.subject, m.body) then
    raise exception 'The email changed after it was approved. Approve it again.';
  end if;
  select * into snd from public.outreach_senders where id = m.sender_id and deleted_at is null;
  if snd.id is null or snd.email <> lower(me.email) then
    raise exception 'This email is set to go from %; only that person can send it.', coalesce(snd.email, 'nobody');
  end if;
  blocker := public.rr_outreach_blocker(m);
  if blocker <> '' then
    raise exception '%', blocker;
  end if;
  if exists (select 1 from public.outreach_messages x
             where x.tenant_id = me.tenant_id and x.status = 'sending' and x.id <> m.id and x.deleted_at is null
               and x.send_started_at > now() - interval '10 minutes') then
    raise exception 'Another outreach email is being sent. Wait for it to finish.';
  end if;
  if public.rr_outreach_sent_today(me.tenant_id) >= s.daily_cap then
    raise exception 'Today''s limit of % outreach emails is reached. Send the rest tomorrow.', s.daily_cap;
  end if;

  update public.outreach_messages
  set status = 'sending', send_started_at = now(), last_error = '',
      unsub_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
  where id = m.id
  returning * into m;
  insert into public.outreach_events (tenant_id, message_id, event, actor_email)
  values (me.tenant_id, m.id, 'send_started', lower(me.email));

  return jsonb_build_object(
    'id', m.id,
    'to_email', m.to_email,
    'to_name', m.to_name,
    'subject', m.subject,
    'body', m.body,
    'sender_email', snd.email,
    'sender_name', snd.display_name,
    'signature', snd.signature,
    'legal_name', s.company_legal_name,
    'address', s.company_address,
    'opt_out_text', s.opt_out_text,
    'unsubscribe_token', token
  );
end $$;
revoke all on function public.rr_outreach_claim_send(uuid) from public, anon;
grant execute on function public.rr_outreach_claim_send(uuid) to authenticated;

-- Server only (service role, from mail-inbox): record the result of a claimed send.
create or replace function public.rr_outreach_finish_send(
  p_id uuid,
  p_ok boolean,
  p_zoho_message_id text default '',
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.outreach_messages%rowtype;
  snd public.outreach_senders%rowtype;
  v_actor text;
begin
  select * into m from public.outreach_messages where id = p_id for update;
  if m.id is null or m.status <> 'sending' then
    raise exception 'That email is not being sent.';
  end if;
  select * into snd from public.outreach_senders where id = m.sender_id;
  v_actor := coalesce(snd.email, '');

  if not p_ok then
    update public.outreach_messages
    set status = case when m.approved_hash is not null then 'ready' else 'awaiting_approval' end,
        last_error = left(coalesce(p_error, 'Not sent'), 500),
        unsub_token_hash = null
    where id = m.id;
    insert into public.outreach_events (tenant_id, message_id, event, actor_email, detail)
    values (m.tenant_id, m.id, 'send_failed', v_actor, jsonb_build_object('error', left(coalesce(p_error, ''), 500)));
    return jsonb_build_object('ok', false);
  end if;

  update public.outreach_messages
  set status = 'sent', sent_at = now(),
      zoho_message_id = case when coalesce(p_zoho_message_id, '') ~ '^[0-9]{1,30}$' then p_zoho_message_id else '' end
  where id = m.id
  returning * into m;

  insert into public.outreach_events (tenant_id, message_id, event, actor_email, detail)
  values (m.tenant_id, m.id, 'sent', v_actor, jsonb_build_object('to', m.to_email, 'zoho_message_id', m.zoho_message_id));

  if m.account_id is not null then
    insert into public.account_activities (account_id, user_id, user_email, kind, body, tenant_id)
    values (m.account_id, snd.user_id, v_actor, 'email',
      'Outreach email sent to ' || coalesce(nullif(m.to_name, ''), m.to_email) || ' <' || m.to_email || '>: "' || left(m.subject, 200) || '"',
      m.tenant_id);
    -- The sent email shows in the client's email history (header only).
    if m.zoho_message_id <> '' and v_actor <> '' then
      insert into public.mail_links (tenant_id, target_type, target_id, mailbox_owner, message_id, folder_id,
        subject, from_address, to_address, sent_at, has_attachment, linked_by)
      values (m.tenant_id, 'account', m.account_id, v_actor, m.zoho_message_id, '',
        left(m.subject, 300), v_actor, m.to_email, now(), false, v_actor)
      on conflict do nothing;
    end if;
  end if;

  if m.deal_id is not null then
    update public.ctrm_deals
    set last_touch_at = now(),
        stage = case when stage = 'identified' then 'contacted' else stage end,
        next_action = case when stage in ('identified', 'contacted') then 'Follow up on the outreach email' else next_action end,
        next_action_date = case when stage in ('identified', 'contacted') then current_date + 5 else next_action_date end,
        updated_at = now()
    where id = m.deal_id and stage not in ('signed', 'lost');
  end if;

  return jsonb_build_object('ok', true, 'id', m.id);
end $$;
revoke all on function public.rr_outreach_finish_send(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.rr_outreach_finish_send(uuid, boolean, text, text) to service_role;

-- A send that never finished (closed tab, network) goes back to approved after 10 minutes.
create or replace function public.rr_outreach_release_stuck(p_id uuid)
returns public.outreach_messages
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me public.app_users := public.rr_outreach_require_human();
  m public.outreach_messages%rowtype;
begin
  select * into m from public.outreach_messages
  where id = p_id and tenant_id = me.tenant_id and deleted_at is null for update;
  if m.id is null or m.status <> 'sending' then
    raise exception 'That email is not being sent.';
  end if;
  if m.send_started_at > now() - interval '10 minutes' then
    raise exception 'Wait 10 minutes after the send started, then check Zoho''s Sent folder first.';
  end if;
  update public.outreach_messages
  set status = 'ready', last_error = 'The send did not finish. Check your Zoho Sent folder before sending again.',
      unsub_token_hash = null
  where id = m.id
  returning * into m;
  insert into public.outreach_events (tenant_id, message_id, event, actor_email, detail)
  values (me.tenant_id, m.id, 'send_failed', lower(me.email), '{"error": "released after 10 minutes"}'::jsonb);
  return m;
end $$;
revoke all on function public.rr_outreach_release_stuck(uuid) from public, anon;
grant execute on function public.rr_outreach_release_stuck(uuid) to authenticated;

------------------------------------------------------------
-- 12. Public unsubscribe (server only, from outreach-unsubscribe)
------------------------------------------------------------
create or replace function public.rr_outreach_unsubscribe(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.outreach_messages%rowtype;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;
  select * into m from public.outreach_messages
  where unsub_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;
  if m.id is null then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.outreach_suppressions (tenant_id, kind, value, reason, source, created_by)
  values (m.tenant_id, 'email', lower(m.to_email), 'unsubscribed', 'unsubscribe link', 'unsubscribe link')
  on conflict do nothing;
  if m.status in ('sent', 'replied') then
    update public.outreach_messages set status = 'unsubscribed' where id = m.id;
  end if;
  insert into public.outreach_events (tenant_id, message_id, event, actor_email)
  values (m.tenant_id, m.id, 'unsubscribed', 'unsubscribe link');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.rr_outreach_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.rr_outreach_unsubscribe(text) to service_role;

notify pgrst, 'reload schema';
