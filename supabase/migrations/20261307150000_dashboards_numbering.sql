-- Custom dashboards stub + seed purchase_order / expense numbering sequences.

create table if not exists public.custom_dashboards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  name text not null,
  layout_json jsonb not null default '{"widgets":[]}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_dashboards_tenant_idx
  on public.custom_dashboards (tenant_id, active);

alter table public.custom_dashboards enable row level security;
revoke all on public.custom_dashboards from anon, authenticated;
grant select, insert, update, delete on public.custom_dashboards to authenticated;

drop policy if exists "Members read custom_dashboards" on public.custom_dashboards;
create policy "Members read custom_dashboards" on public.custom_dashboards
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write custom_dashboards" on public.custom_dashboards;
create policy "Staff write custom_dashboards" on public.custom_dashboards
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.custom_dashboards;
create policy "Tenant isolation" on public.custom_dashboards
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.custom_dashboards;
drop policy if exists "Viewers read" on public.custom_dashboards;

-- Allow purchase_order in numbering doc_type check.
do $$
begin
  alter table public.numbering_sequences drop constraint if exists numbering_sequences_doc_type_check;
exception when undefined_object then null;
end $$;

alter table public.numbering_sequences
  add constraint numbering_sequences_doc_type_check
  check (doc_type in (
    'quotation', 'invoice', 'delivery_note', 'account', 'expense', 'purchase_order', 'other'
  ));

-- Seed expense + purchase_order sequences for default tenant (idempotent).
insert into public.numbering_sequences (
  tenant_id, doc_type, division_code, prefix, year_yy, last_seq, pad, active
)
values
  ('a0000000-0000-4000-8000-000000000001', 'expense', '01', 'EX', to_char(now(), 'YY'), 0, 3, true),
  ('a0000000-0000-4000-8000-000000000001', 'purchase_order', '01', 'PO', to_char(now(), 'YY'), 0, 3, true)
on conflict (tenant_id, doc_type, division_code, prefix, year_yy) do nothing;

comment on table public.custom_dashboards is 'M2 custom dashboards stub — widget layout later.';
