-- Gap plan module 1: Maker-checker (docs/MODULE_BUILD_PLAN.md, docs/modules/maker-checker.md).
-- Four-eyes approval for sensitive actions (payroll runs, refunds, large
-- expenses, ...). The person who asks (maker) can never approve their own
-- request; only managers and admins decide, through security definer
-- functions, so the rule holds even for direct API calls.
-- Safe to re-run.

begin;

create table if not exists public.approval_policies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  action_key text not null check (action_key ~ '^[a-z0-9_.]+$'),
  label text not null default '',
  -- null = every amount needs a checker; otherwise only amounts >= this.
  min_amount numeric(14, 2) check (min_amount is null or min_amount >= 0),
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, action_key)
);

create table if not exists public.approval_requests (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  action_key text not null check (action_key ~ '^[a-z0-9_.]+$'),
  entity_type text not null default '',
  entity_id text not null default '',
  summary text not null check (btrim(summary) <> ''),
  payload jsonb not null default '{}'::jsonb,
  amount numeric(14, 2),
  currency text not null default 'AED',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  maker_email text not null default '',
  checker_email text,
  decision_reason text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_requests_decided check (
    (status = 'pending' and checker_email is null and decided_at is null)
    or (status = 'cancelled' and decided_at is not null)
    or (status in ('approved', 'rejected') and checker_email is not null and decided_at is not null)
  ),
  constraint approval_requests_four_eyes check (
    checker_email is null or lower(checker_email) <> lower(maker_email)
  ),
  constraint approval_requests_reject_reason check (
    status <> 'rejected' or btrim(decision_reason) <> ''
  )
);

create index if not exists approval_requests_status_idx
  on public.approval_requests (tenant_id, status, created_at desc);
create index if not exists approval_requests_entity_idx
  on public.approval_requests (tenant_id, entity_type, entity_id);
create index if not exists approval_requests_maker_idx
  on public.approval_requests (lower(maker_email));

-- Maker is always the signed in user; status always starts pending.
create or replace function public.rr_approval_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null then
    new.maker_email := coalesce(public.rr_current_email(), '');
  end if;
  new.status := 'pending';
  new.checker_email := null;
  new.decided_at := null;
  new.decision_reason := '';
  return new;
end;
$$;

drop trigger if exists rr_approval_requests_before_insert on public.approval_requests;
create trigger rr_approval_requests_before_insert
  before insert on public.approval_requests
  for each row execute function public.rr_approval_requests_before_insert();

------------------------------------------------------------
-- Functions
------------------------------------------------------------
create or replace function public.rr_approval_required(p_action_key text, p_amount numeric default null)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select p.required and (p.min_amount is null or coalesce(p_amount, 0) >= p.min_amount)
    from public.approval_policies p
    where p.tenant_id = public.rr_my_tenant_id()
      and p.action_key = p_action_key
      and p.active
    limit 1
  ), false)
$$;

create or replace function public.rr_approval_decide(p_id uuid, p_approve boolean, p_reason text default '')
returns public.approval_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me text := public.rr_current_email();
  r public.approval_requests;
begin
  if me is null or not public.rr_is_manager_or_admin() then
    raise exception 'Only a manager or admin can approve or reject' using errcode = '42501';
  end if;
  select * into r from public.approval_requests
  where id = p_id and tenant_id = public.rr_my_tenant_id()
  for update;
  if not found then
    raise exception 'Approval request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request is already %', r.status using errcode = '22023';
  end if;
  if lower(r.maker_email) = lower(me) then
    raise exception 'You cannot approve or reject your own request' using errcode = '42501';
  end if;
  if not p_approve and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give a reason when rejecting' using errcode = '22023';
  end if;
  update public.approval_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         checker_email = me,
         decision_reason = btrim(coalesce(p_reason, '')),
         decided_at = now(),
         updated_at = now()
   where id = p_id
  returning * into r;
  return r;
end;
$$;

create or replace function public.rr_approval_cancel(p_id uuid)
returns public.approval_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me text := public.rr_current_email();
  r public.approval_requests;
begin
  select * into r from public.approval_requests
  where id = p_id and tenant_id = public.rr_my_tenant_id()
  for update;
  if not found or me is null or lower(r.maker_email) <> lower(me) then
    raise exception 'Only the person who asked can cancel' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request is already %', r.status using errcode = '22023';
  end if;
  update public.approval_requests
     set status = 'cancelled', decided_at = now(), updated_at = now()
   where id = p_id
  returning * into r;
  return r;
end;
$$;

revoke all on function public.rr_approval_required(text, numeric) from public;
revoke all on function public.rr_approval_decide(uuid, boolean, text) from public;
revoke all on function public.rr_approval_cancel(uuid) from public;
grant execute on function public.rr_approval_required(text, numeric) to authenticated;
grant execute on function public.rr_approval_decide(uuid, boolean, text) to authenticated;
grant execute on function public.rr_approval_cancel(uuid) to authenticated;

------------------------------------------------------------
-- Default policies for Red Reach (config only; edit in the app)
------------------------------------------------------------
insert into public.approval_policies (tenant_id, action_key, label, min_amount, required)
values
  ('a0000000-0000-4000-8000-000000000001', 'payroll.run', 'Approve a payroll run before paying', null, true),
  ('a0000000-0000-4000-8000-000000000001', 'payment.refund', 'Refund to a customer', null, true),
  ('a0000000-0000-4000-8000-000000000001', 'expense.large', 'Expense at or above the limit', 10000, true)
on conflict (tenant_id, action_key) do nothing;

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.approval_policies enable row level security;
alter table public.approval_requests enable row level security;
revoke all on public.approval_policies from anon;
revoke all on public.approval_requests from anon;
grant select, insert, update, delete on public.approval_policies to authenticated;
-- No direct UPDATE/DELETE on requests: decisions go through rr_approval_decide / rr_approval_cancel.
revoke update, delete on public.approval_requests from authenticated;
grant select, insert on public.approval_requests to authenticated;

drop policy if exists "Members read approval policies" on public.approval_policies;
create policy "Members read approval policies" on public.approval_policies
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_member());

drop policy if exists "Admins write approval policies" on public.approval_policies;
create policy "Admins write approval policies" on public.approval_policies
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

-- Admin, manager, sales see every request in the tenant; staff and viewer only their own.
drop policy if exists "Read approval requests" on public.approval_requests;
create policy "Read approval requests" on public.approval_requests
  for select to authenticated
  using (
    tenant_id = public.rr_my_tenant_id()
    and (
      public.rr_is_staff()
      or lower(maker_email) = public.rr_current_email()
    )
  );

-- Anyone on the team except viewers can ask.
drop policy if exists "Members raise approval requests" on public.approval_requests;
create policy "Members raise approval requests" on public.approval_requests
  for insert to authenticated
  with check (
    tenant_id = public.rr_my_tenant_id()
    and public.rr_is_member()
    and public.rr_current_role() <> 'viewer'
  );

do $$
declare
  t text;
begin
  foreach t in array array['approval_policies', 'approval_requests']
  loop
    -- Older migrations re-run in CI pass 2 stamp every table with these broad
    -- policies; strip them so only the rules above apply.
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t
    );
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()',
      t
    );
  end loop;
end $$;

comment on table public.approval_policies is 'Gap plan maker-checker: which actions need a second person.';
comment on table public.approval_requests is 'Gap plan maker-checker: four-eyes requests; decide via rr_approval_decide.';

notify pgrst, 'reload schema';

commit;
