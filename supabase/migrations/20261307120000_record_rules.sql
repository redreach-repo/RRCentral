-- M2: record rules stub (evaluate in app; no RLS rewrite).

create table if not exists public.record_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  object_type text not null,
  name text not null,
  scope text not null default 'owner'
    check (scope in ('all', 'owner', 'team')),
  filter_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, object_type, name)
);

create index if not exists record_rules_tenant_idx
  on public.record_rules (tenant_id, object_type, active);

alter table public.record_rules enable row level security;
revoke all on public.record_rules from anon, authenticated;
grant select, insert, update, delete on public.record_rules to authenticated;

drop policy if exists "Members read record_rules" on public.record_rules;
create policy "Members read record_rules" on public.record_rules
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write record_rules" on public.record_rules;
create policy "Admins write record_rules" on public.record_rules
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Tenant isolation" on public.record_rules;
create policy "Tenant isolation" on public.record_rules
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.record_rules;
drop policy if exists "Viewers read" on public.record_rules;

comment on table public.record_rules is
  'M2 record-visibility stub — app evaluates; RLS not rewritten yet.';
