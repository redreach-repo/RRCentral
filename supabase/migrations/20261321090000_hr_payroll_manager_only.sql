-- HR and payroll: managers and admins only.
--
-- 20261217120000_feature_slices_m6_m12 (and the generic "Staff full access" /
-- "Viewers read" defaults) let every staff login, sales included, and viewers
-- read and change HR people, payroll runs, payroll lines (salaries, IBANs)
-- and attendance. This drops those broad policies and leaves one rule:
-- manager or admin, in their own company.
--
-- Changes permissions only. No rows are added, changed or deleted.
-- Leave requests and payroll exports were already manager only.
-- Run it straight after 20261217120000 (and again if that file, or
-- 20260926090000_security_rls, is ever run again). Safe to re-run.

do $$
declare
  t text;
begin
  foreach t in array array['hr_employees', 'payroll_runs', 'payroll_lines', 'hr_attendance_days']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff write ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
    execute format('drop policy if exists %I on public.%I', 'Managers manage ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())
         with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())',
      'Managers manage ' || t, t
    );
  end loop;
end $$;
