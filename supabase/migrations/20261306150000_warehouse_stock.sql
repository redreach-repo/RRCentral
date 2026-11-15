-- Per-warehouse stock stub; products.stock_on_hand remains the rollup.

create table if not exists public.warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  sku text not null,
  qty_on_hand numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, warehouse_id, sku)
);

create index if not exists warehouse_stock_sku_idx
  on public.warehouse_stock (tenant_id, sku);

alter table public.warehouse_stock enable row level security;
revoke all on public.warehouse_stock from anon, authenticated;
grant select, insert, update, delete on public.warehouse_stock to authenticated;

drop policy if exists "Members read warehouse_stock" on public.warehouse_stock;
create policy "Members read warehouse_stock" on public.warehouse_stock
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write warehouse_stock" on public.warehouse_stock;
create policy "Staff write warehouse_stock" on public.warehouse_stock
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.warehouse_stock;
create policy "Tenant isolation" on public.warehouse_stock
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

comment on table public.warehouse_stock is
  'M9 deepen: per-warehouse qty stub; rollup still on products.stock_on_hand.';
