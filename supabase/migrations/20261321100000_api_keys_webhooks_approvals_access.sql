-- API keys, webhooks and approvals: tighter access.
--
-- 20261217120000_feature_slices_m6_m12 (plus the generic "Staff full access" /
-- "Viewers read" defaults) let every staff login, sales included, and viewers
-- read and change API keys, webhook endpoints and approval requests. Now:
--   * api_keys, webhook_endpoints: admin only.
--   * approval_requests: managers and admins see and decide every request;
--     other team members (not viewers) can raise a request, see their own,
--     and cancel their own while it is pending. Only admins delete.
--
-- Changes permissions only. No rows are added, changed or deleted.
-- Run it straight after 20261217120000 (and again if that file, or
-- 20260926090000_security_rls, is ever run again). Safe to re-run.

do $$
declare
  t text;
begin
  foreach t in array array['api_keys', 'webhook_endpoints', 'approval_requests']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff write ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
  end loop;

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

  if to_regclass('public.approval_requests') is null then
    return;
  end if;

  drop policy if exists "Managers manage approvals" on public.approval_requests;
  create policy "Managers manage approvals" on public.approval_requests
    for all to authenticated
    using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())
    with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

  drop policy if exists "Team reads own approvals" on public.approval_requests;
  create policy "Team reads own approvals" on public.approval_requests
    for select to authenticated
    using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff() and public.rr_current_role() <> 'viewer'
           and requested_by = public.rr_current_user_id());

  drop policy if exists "Team raises approvals" on public.approval_requests;
  create policy "Team raises approvals" on public.approval_requests
    for insert to authenticated
    with check (
      tenant_id = public.rr_my_tenant_id()
      and public.rr_is_staff()
      and public.rr_current_role() <> 'viewer'
      and status = 'pending'
      and (requested_by is null or requested_by = public.rr_current_user_id())
    );

  drop policy if exists "Team cancels own approvals" on public.approval_requests;
  create policy "Team cancels own approvals" on public.approval_requests
    for update to authenticated
    using (tenant_id = public.rr_my_tenant_id() and requested_by = public.rr_current_user_id() and status = 'pending')
    with check (tenant_id = public.rr_my_tenant_id() and requested_by = public.rr_current_user_id() and status = 'canceled');
end $$;
