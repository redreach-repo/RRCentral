-- M9 deepen: multi-warehouse stub (default warehouse + stamp on movements).

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  code text not null default '',
  name text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists warehouses_tenant_idx on public.warehouses (tenant_id, active);

alter table public.inventory_movements
  add column if not exists warehouse_id uuid references public.warehouses (id) on delete set null;

create index if not exists inventory_movements_warehouse_idx
  on public.inventory_movements (warehouse_id);

alter table public.purchase_orders
  add column if not exists warehouse_id uuid references public.warehouses (id) on delete set null;

create index if not exists purchase_orders_warehouse_idx
  on public.purchase_orders (warehouse_id);

insert into public.warehouses (tenant_id, code, name, is_default)
values ('a0000000-0000-4000-8000-000000000001', 'MAIN', 'Main warehouse', true)
on conflict (tenant_id, code) do nothing;

alter table public.warehouses enable row level security;
revoke all on public.warehouses from anon, authenticated;
grant select, insert, update, delete on public.warehouses to authenticated;

drop policy if exists "Members read warehouses" on public.warehouses;
create policy "Members read warehouses" on public.warehouses
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write warehouses" on public.warehouses;
create policy "Staff write warehouses" on public.warehouses
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.warehouses;
create policy "Tenant isolation" on public.warehouses
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.warehouses;
drop policy if exists "Viewers read" on public.warehouses;

comment on table public.warehouses is 'M9: warehouse stub — stock still rolls up on products.stock_on_hand.';
