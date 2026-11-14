-- Permission fix for the M6–M12 first slices (Cursor #413,
-- 20261217120000_feature_slices_m6_m12.sql). See docs/modules/m6-m12-permissions.md.
--
-- #413 gave every rr_is_staff() user (admin, manager AND sales) full read and
-- write on payroll, HR, approvals, API keys and webhooks. This migration:
--   * HR + payroll: manager and admin only (salaries, IBANs).
--   * API keys + webhook endpoints: admin only.
--   * Approvals: team members (not viewers) can ask; the asker is set by the
--     database; only a manager or admin who is NOT the asker can approve or
--     reject; only the asker (or an admin) can cancel; decisions are final.
-- Run it AFTER 20261217120000 and 20261217140000. If 20261217120000 is ever
-- run again, run this again too (it re-creates the broad policies).
-- Safe to re-run.

begin;

------------------------------------------------------------
-- Drop the broad #413 policies (and the CI pass 2 stamps)
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'hr_employees', 'payroll_runs', 'payroll_lines',
    'approval_requests', 'api_keys', 'webhook_endpoints'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'Members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff write ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
  end loop;
end $$;

------------------------------------------------------------
-- HR + payroll: manager and admin
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['hr_employees', 'payroll_runs', 'payroll_lines']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'Managers manage ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())
         with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())',
      'Managers manage ' || t, t
    );
  end loop;
end $$;

------------------------------------------------------------
-- API keys + webhooks: admin
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['api_keys', 'webhook_endpoints']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'Admins manage ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
         with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())',
      'Admins manage ' || t, t
    );
  end loop;
end $$;

------------------------------------------------------------
-- Approvals: four eyes in the database
------------------------------------------------------------
do $$
begin
  if to_regclass('public.approval_requests') is null then
    return;
  end if;

  execute 'drop policy if exists "Team reads approvals" on public.approval_requests';
  execute $p$create policy "Team reads approvals" on public.approval_requests
    for select to authenticated
    using (
      tenant_id = public.rr_my_tenant_id()
      and (public.rr_is_staff() or requested_by = public.rr_current_user_id())
    )$p$;

  execute 'drop policy if exists "Team raises approvals" on public.approval_requests';
  execute $p$create policy "Team raises approvals" on public.approval_requests
    for insert to authenticated
    with check (
      tenant_id = public.rr_my_tenant_id()
      and public.rr_is_member()
      and public.rr_current_role() <> 'viewer'
    )$p$;

  -- Row access for updates; the trigger below decides which changes are allowed.
  execute 'drop policy if exists "Team updates approvals" on public.approval_requests';
  execute $p$create policy "Team updates approvals" on public.approval_requests
    for update to authenticated
    using (
      tenant_id = public.rr_my_tenant_id()
      and (public.rr_is_manager_or_admin() or requested_by = public.rr_current_user_id())
    )
    with check (tenant_id = public.rr_my_tenant_id())$p$;

  execute 'drop policy if exists "Admins delete approvals" on public.approval_requests';
  execute $p$create policy "Admins delete approvals" on public.approval_requests
    for delete to authenticated
    using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())$p$;
end $$;

create or replace function public.rr_approval_four_eyes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := public.rr_current_user_id();
begin
  -- Service role / SQL editor (no signed in user): leave as is.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.requested_by := me;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := '';
    return new;
  end if;

  -- UPDATE
  if new.tenant_id is distinct from old.tenant_id
     or new.requested_by is distinct from old.requested_by
     or new.object_type is distinct from old.object_type
     or new.object_id is distinct from old.object_id
     or new.action is distinct from old.action
     or new.amount_aed is distinct from old.amount_aed then
    raise exception 'An approval request cannot be changed after it is raised' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'This request is already %', old.status using errcode = '42501';
    end if;
    if new.status in ('approved', 'rejected') then
      if not public.rr_is_manager_or_admin() then
        raise exception 'Only a manager or admin can approve or reject' using errcode = '42501';
      end if;
      if old.requested_by is not null and old.requested_by = me then
        raise exception 'You cannot approve or reject your own request' using errcode = '42501';
      end if;
    elsif new.status = 'canceled' then
      if not (old.requested_by = me or public.rr_is_admin()) then
        raise exception 'Only the person who asked (or an admin) can cancel' using errcode = '42501';
      end if;
    end if;
    new.decided_by := me;
    new.decided_at := now();
  elsif old.status <> 'pending' and (
    new.decided_by is distinct from old.decided_by
    or new.decided_at is distinct from old.decided_at
    or new.decision_note is distinct from old.decision_note
  ) then
    raise exception 'A decided request is final' using errcode = '42501';
  elsif old.status = 'pending' and (
    new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at
  ) then
    raise exception 'Decide by changing the status' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.approval_requests') is null then
    return;
  end if;
  execute 'drop trigger if exists rr_approval_four_eyes on public.approval_requests';
  execute 'create trigger rr_approval_four_eyes
    before insert or update on public.approval_requests
    for each row execute function public.rr_approval_four_eyes()';
  -- Keep a trail of every decision.
  execute 'drop trigger if exists rr_audit on public.approval_requests';
  execute 'create trigger rr_audit after insert or update or delete on public.approval_requests
    for each row execute function public.rr_audit_trigger()';
end $$;

notify pgrst, 'reload schema';

commit;
