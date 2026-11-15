-- M9a: client (customer) purchase order tracker.

create table if not exists public.client_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  account_id uuid not null references public.accounts (id) on delete cascade,
  po_number text not null,
  status text not null default 'open'
    check (status in ('open', 'partial', 'fulfilled', 'canceled')),
  issued_on date,
  expires_on date,
  currency text not null default 'AED',
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  quotation_id uuid references public.quotations (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, account_id, po_number)
);

create index if not exists client_purchase_orders_tenant_idx
  on public.client_purchase_orders (tenant_id, status, issued_on desc);
create index if not exists client_purchase_orders_account_idx
  on public.client_purchase_orders (account_id);

alter table public.client_purchase_orders enable row level security;
revoke all on public.client_purchase_orders from anon, authenticated;
grant select, insert, update, delete on public.client_purchase_orders to authenticated;

drop policy if exists "Members read client_purchase_orders" on public.client_purchase_orders;
create policy "Members read client_purchase_orders" on public.client_purchase_orders
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write client_purchase_orders" on public.client_purchase_orders;
create policy "Staff write client_purchase_orders" on public.client_purchase_orders
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.client_purchase_orders;
create policy "Tenant isolation" on public.client_purchase_orders
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.client_purchase_orders;
drop policy if exists "Viewers read" on public.client_purchase_orders;

comment on table public.client_purchase_orders is 'M9a: customer PO numbers tracked against accounts.';
