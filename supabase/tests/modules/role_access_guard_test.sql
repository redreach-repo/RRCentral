-- Role access guard: whole-database checks that fail CI when a new table or
-- policy opens data to the wrong people. Reads the catalog only.
--   1. Every public table has row level security on.
--   2. Every table with tenant_id has a restrictive tenant isolation policy.
--   3. The only policies open to anonymous visitors are the allow-listed ones.
--   4. Sensitive tables (HR, payroll, audit, field access log) have no
--      permissive policy for all staff, sales or viewers.
--   5. Live role check on sensitive tables with a real row.
begin;
\ir _fixtures.sql

do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  perform pg_temp.expect(bad is null, 'every public table has row level security (missing: ' || coalesce(bad, 'none') || ')');

  select string_agg(distinct c.table_name, ', ') into bad
  from information_schema.columns c
  join pg_tables t on t.schemaname = 'public' and t.tablename = c.table_name
  where c.table_schema = 'public' and c.column_name = 'tenant_id'
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.table_name and p.permissive = 'RESTRICTIVE'
    );
  perform pg_temp.expect(bad is null, 'every tenant table has tenant isolation (missing: ' || coalesce(bad, 'none') || ')');

  -- Add to this list only on purpose: these are open to website visitors.
  select string_agg(p.tablename || '.' || p.policyname, ', ') into bad
  from pg_policies p
  where p.schemaname = 'public'
    and p.roles && array['anon', 'public']::name[]
    and (p.tablename, p.policyname) not in (
      ('website_inquiries', 'Public submit inquiry'),
      ('business_type_packs', 'Anyone read business_type_packs')
    );
  perform pg_temp.expect(bad is null, 'no unexpected policies for anonymous visitors (found: ' || coalesce(bad, 'none') || ')');

  select string_agg(p.tablename || '.' || p.policyname, ', ') into bad
  from pg_policies p
  where p.schemaname = 'public'
    and p.permissive = 'PERMISSIVE'
    and p.tablename in (
      'hr_employees', 'payroll_runs', 'payroll_lines', 'hr_attendance_days',
      'hr_leave_requests', 'payroll_exports', 'audit_log', 'fle_access_log'
    )
    and (
      coalesce(p.qual, '') ~ 'rr_is_staff\(|rr_is_member\(|''viewer''|''sales''|^true$'
      or coalesce(p.with_check, '') ~ 'rr_is_staff\(|rr_is_member\(|''viewer''|''sales''|^true$'
    );
  perform pg_temp.expect(bad is null, 'HR, payroll and audit tables are not open to all staff, sales or viewers (found: ' || coalesce(bad, 'none') || ')');
end $$;

-- Live check: one row in each sensitive table, then read it as each role.
insert into public.hr_employees (id, tenant_id, employee_code, full_name, employment_status)
values ('e5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'RG-1', 'Guard Tester', 'active')
on conflict do nothing;
insert into public.audit_log (table_name, operation) values ('crm', 'UPDATE');

do $$
declare
  who text;
  can_read boolean;
begin
  foreach who in array array['admin', 'manager', 'staff', 'sales', 'viewer', 'stranger', 'b_admin']
  loop
    perform pg_temp.login(who);
    can_read := exists (select 1 from public.hr_employees where id = 'e5000000-0000-4000-8000-000000000001');
    perform pg_temp.expect(can_read = (who in ('admin', 'manager')), who || (case when who in ('admin', 'manager') then ' can' else ' cannot' end) || ' read HR people');
    if who in ('staff', 'sales', 'viewer', 'stranger') then
      perform pg_temp.expect(not exists (select 1 from public.audit_log), who || ' cannot read the audit log');
    end if;
    reset role;
  end loop;
end $$;

rollback;
