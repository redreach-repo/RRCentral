-- Cross-tenant isolation (RRCRM M1).
-- Run after migrations (and ideally after rls_test.sql fixtures).
-- Raises on failure.
\set ON_ERROR_STOP 1

create or replace function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'TENANT TEST FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Ensure Red Reach admin fixture exists (also seeded by rls_test.sql).
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'alfred@redreach.ae', now())
on conflict (id) do nothing;

insert into public.app_users (email, name, role, active, tenant_id)
values (
  'alfred@redreach.ae',
  'Alfred',
  'admin',
  true,
  'a0000000-0000-4000-8000-000000000001'
)
on conflict (email) do update
  set active = true,
      role = 'admin',
      tenant_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.crm (company_name, tenant_id)
values ('Lead Co', 'a0000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Second tenant + user (isolated from Red Reach)
insert into public.tenants (id, name, slug, status, is_demo)
values (
  'b0000000-0000-4000-8000-000000000001',
  'Demo Tenant B',
  'demo-b',
  'active',
  true
)
on conflict (id) do nothing;

insert into public.companies (id, tenant_id, name, legal_name, is_default)
values (
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000001',
  'Demo Co B',
  'Demo Co B LLC',
  true
)
on conflict (id) do nothing;

insert into auth.users values
  ('00000000-0000-0000-0000-0000000000b1', 'admin@demo-b.test', now())
on conflict (id) do nothing;

insert into public.app_users (email, name, role, active, tenant_id)
values (
  'admin@demo-b.test',
  'Demo B Admin',
  'admin',
  true,
  'b0000000-0000-4000-8000-000000000001'
)
on conflict (email) do update
  set tenant_id = excluded.tenant_id, active = true, role = 'admin';

insert into public.crm (company_name, tenant_id)
values ('Tenant B Secret Lead', 'b0000000-0000-4000-8000-000000000001');

insert into public.vendors (company_name, tenant_id)
values ('Tenant B Secret Vendor', 'b0000000-0000-4000-8000-000000000001');

------------------------------------------------------------ Red Reach admin cannot see tenant B
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select pg_temp.expect(
  public.rr_my_tenant_id() = 'a0000000-0000-4000-8000-000000000001'::uuid,
  'redreach admin resolves own tenant id'
);
select pg_temp.expect(
  (select count(*) from public.crm where company_name = 'Tenant B Secret Lead') = 0,
  'redreach admin cannot read tenant B CRM'
);
select pg_temp.expect(
  (select count(*) from public.vendors where company_name = 'Tenant B Secret Vendor') = 0,
  'redreach admin cannot read tenant B vendors'
);
select pg_temp.expect(
  (select count(*) from public.tenants where slug = 'demo-b') = 0,
  'redreach admin cannot see other tenants row'
);
select pg_temp.expect(
  (select count(*) from public.companies where name = 'Demo Co B') = 0,
  'redreach admin cannot see tenant B companies'
);
select pg_temp.expect(
  (select count(*) from public.app_users where lower(email) = 'admin@demo-b.test') = 0,
  'redreach admin cannot see tenant B users'
);

------------------------------------------------------------ Tenant B admin cannot see Red Reach CRM seed
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

select pg_temp.expect(
  public.rr_my_tenant_id() = 'b0000000-0000-4000-8000-000000000001'::uuid,
  'demo-b admin resolves own tenant id'
);
select pg_temp.expect(
  (select count(*) from public.crm where company_name = 'Lead Co') = 0,
  'tenant B admin cannot read redreach CRM'
);
select pg_temp.expect(
  (select count(*) from public.crm where company_name = 'Tenant B Secret Lead') = 1,
  'tenant B admin can read own CRM'
);
select pg_temp.expect(
  (select count(*) from public.tenants) = 1,
  'tenant B admin sees only own tenant'
);
select pg_temp.expect(
  (select slug from public.tenants) = 'demo-b',
  'tenant B admin sees demo-b slug'
);

------------------------------------------------------------ Cannot insert into another tenant
do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.crm (company_name, tenant_id)
    values ('Forged into A', 'a0000000-0000-4000-8000-000000000001');
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'TENANT TEST FAILED: tenant B admin inserted into redreach tenant';
  end if;
  raise notice 'ok - tenant B cannot insert into redreach tenant_id';
end $$;

reset role;

select pg_temp.expect(true, 'tenant isolation suite complete');
