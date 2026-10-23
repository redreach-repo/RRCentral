-- RR Central modules, Phase 3: shared support desk.
--
-- * `sla_policies`: first response time in working hours, per AI CRM package
--   or per account type (WorshipHub churches default to 2 working days).
-- * `tickets` and `ticket_messages`: one queue for every account type.
-- * The working week lives in app_settings (`supportWorkingDays` as ISO
--   weekdays, `supportDayStart`, `supportDayEnd`, Dubai time). Admins change it.
--
-- Access follows the account, like the rest of the modules: staff only see
-- tickets on accounts assigned to them. Email from an unknown sender lands
-- with no account; only admin, manager and sales see those until filed.
--
-- Safe to re-run. Needs 20261024090000_client_delivery.sql first.

------------------------------------------------------------
-- 1. SLA policies
------------------------------------------------------------
create table if not exists public.sla_policies (
  id uuid primary key default uuid_generate_v4(),
  applies_to text not null check (applies_to in ('package', 'account_type')),
  package_id uuid references public.delivery_packages(id) on delete cascade,
  account_type text check (account_type in ('ai_crm_client', 'worship_church', 'ctrm_prospect')),
  label text not null default '',
  first_response_hours numeric(6,2) not null default 18 check (first_response_hours >= 0),
  updated_at timestamptz not null default now(),
  check (
    (applies_to = 'package' and package_id is not null and account_type is null)
    or (applies_to = 'account_type' and account_type is not null and package_id is null)
  )
);
create unique index if not exists sla_policies_package_uniq
  on public.sla_policies (package_id) where applies_to = 'package';
create unique index if not exists sla_policies_account_type_uniq
  on public.sla_policies (account_type) where applies_to = 'account_type';

-- One working day is 9 hours (09:00 to 18:00). "Same day" is 4 working hours.
insert into public.sla_policies (applies_to, package_id, label, first_response_hours)
select 'package', p.id, p.name || ' package',
  case when p.support_response_days > 0 then p.support_response_days * 9 else 4 end
from public.delivery_packages p
where not exists (
  select 1 from public.sla_policies s where s.applies_to = 'package' and s.package_id = p.id
);

insert into public.sla_policies (applies_to, account_type, label, first_response_hours)
select 'account_type', v.t, v.label, 18
from (values
  ('worship_church', 'WorshipHub churches'),
  ('ai_crm_client', 'AI CRM clients without a contract'),
  ('ctrm_prospect', 'CTRM prospects')
) as v(t, label)
where not exists (
  select 1 from public.sla_policies s where s.applies_to = 'account_type' and s.account_type = v.t
);

------------------------------------------------------------
-- 2. Tickets and messages
------------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references public.accounts(id) on delete cascade,
  contact_id uuid references public.account_contacts(id) on delete set null,
  requester_email text not null default '',
  subject text not null default '',
  channel text not null default 'email'
    check (channel in ('email', 'whatsapp', 'phone', 'in_person', 'internal')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new'
    check (status in ('new', 'open', 'waiting_on_client', 'resolved', 'closed')),
  assignee_user_id uuid references public.app_users(id) on delete set null,
  sla_hours numeric(6,2) not null default 18,
  sla_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tickets_account_idx on public.tickets (account_id);
create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_due_idx on public.tickets (sla_due_at);

create table if not exists public.ticket_messages (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_kind text not null default 'user' check (author_kind in ('user', 'contact')),
  author_user_id uuid references public.app_users(id) on delete set null,
  author_label text not null default '',
  body text not null default '',
  is_internal_note boolean not null default false,
  external_id text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);
create index if not exists ticket_messages_external_idx
  on public.ticket_messages (external_id) where external_id <> '';

------------------------------------------------------------
-- 3. Config: working week (admin only to change)
------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('supportWorkingDays', '1,2,3,4,5'),
  ('supportDayStart', '09:00'),
  ('supportDayEnd', '18:00')
on conflict (key) do nothing;

create or replace function public.rr_is_protected_setting(setting_key text)
returns boolean
language sql
immutable
as $$
  select setting_key in (
      'companyName', 'accountName', 'bankName', 'bankAccount', 'iban', 'swift',
      'trn', 'vatRate', 'currency', 'email', 'address', 'apiToken'
    )
    or public.rr_is_secret_setting(setting_key)
    or setting_key ilike 'zoho%'
    or setting_key in (
      'deliveryMarketingRateAed', 'deliveryServiceRateAed', 'deliveryAiMarkupPercent',
      'deliveryLeadMarkupPercent', 'deliveryInternalHourlyRateAed', 'deliveryUsdToAed',
      'supportWorkingDays', 'supportDayStart', 'supportDayEnd'
    )
$$;

------------------------------------------------------------
-- 4. Row Level Security
------------------------------------------------------------
-- A ticket with no account is visible to the core team only.
create or replace function public.rr_can_read_ticket(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.tickets t
    where t.id = target
      and (
        (t.account_id is null and public.rr_is_staff())
        or (t.account_id is not null and public.rr_can_read_account(t.account_id))
      )
  )
$$;
create or replace function public.rr_can_write_ticket(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.tickets t
    where t.id = target
      and (
        (t.account_id is null and public.rr_is_staff())
        or (t.account_id is not null and public.rr_can_write_account(t.account_id))
      )
  )
$$;
revoke all on function public.rr_can_read_ticket(uuid) from public;
revoke all on function public.rr_can_write_ticket(uuid) from public;
grant execute on function public.rr_can_read_ticket(uuid) to authenticated;
grant execute on function public.rr_can_write_ticket(uuid) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['sla_policies', 'tickets', 'ticket_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    -- Never the blanket policy 20260926090000_security_rls.sql adds on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
  end loop;
end $$;

drop policy if exists "Members read SLA policies" on public.sla_policies;
drop policy if exists "Managers edit SLA policies" on public.sla_policies;
create policy "Members read SLA policies" on public.sla_policies
  for select to authenticated using (public.rr_is_member());
create policy "Managers edit SLA policies" on public.sla_policies
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

drop policy if exists "Read tickets on visible accounts" on public.tickets;
drop policy if exists "Create tickets on editable accounts" on public.tickets;
drop policy if exists "Update tickets on editable accounts" on public.tickets;
drop policy if exists "Managers delete tickets" on public.tickets;
create policy "Read tickets on visible accounts" on public.tickets
  for select to authenticated
  using (
    (account_id is null and public.rr_is_staff())
    or (account_id is not null and public.rr_can_read_account(account_id))
  );
create policy "Create tickets on editable accounts" on public.tickets
  for insert to authenticated
  with check (
    (account_id is null and public.rr_is_staff())
    or (account_id is not null and public.rr_can_write_account(account_id))
  );
create policy "Update tickets on editable accounts" on public.tickets
  for update to authenticated
  using (
    (account_id is null and public.rr_is_staff())
    or (account_id is not null and public.rr_can_write_account(account_id))
  )
  with check (
    (account_id is null and public.rr_is_staff())
    or (account_id is not null and public.rr_can_write_account(account_id))
  );
create policy "Managers delete tickets" on public.tickets
  for delete to authenticated using (public.rr_is_manager_or_admin());

drop policy if exists "Read messages on visible tickets" on public.ticket_messages;
drop policy if exists "Reply on editable tickets" on public.ticket_messages;
drop policy if exists "Managers edit messages" on public.ticket_messages;
drop policy if exists "Managers delete messages" on public.ticket_messages;
create policy "Read messages on visible tickets" on public.ticket_messages
  for select to authenticated using (public.rr_can_read_ticket(ticket_id));
-- Team members post as themselves; contact messages come in through the email function.
create policy "Reply on editable tickets" on public.ticket_messages
  for insert to authenticated
  with check (
    public.rr_can_write_ticket(ticket_id)
    and author_kind = 'user'
    and author_user_id is not distinct from public.rr_current_user_id()
  );
create policy "Managers edit messages" on public.ticket_messages
  for update to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());
create policy "Managers delete messages" on public.ticket_messages
  for delete to authenticated using (public.rr_is_manager_or_admin());

-- Audit trail.
do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    return;
  end if;
  foreach t in array array['sla_policies', 'tickets', 'ticket_messages'] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
