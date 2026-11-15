-- M9: purchase orders + receive into product stock.

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  po_number text not null default '',
  vendor_name text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'ordered', 'partial', 'received', 'canceled')),
  order_date date not null default current_date,
  expected_date date,
  currency text not null default 'AED',
  notes text not null default '',
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists purchase_orders_tenant_number_uidx
  on public.purchase_orders (tenant_id, po_number)
  where po_number <> '';

create index if not exists purchase_orders_tenant_idx
  on public.purchase_orders (tenant_id, status, order_date desc);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  line_no int not null default 1 check (line_no > 0),
  sku text not null default '',
  description text not null default '',
  qty_ordered numeric(12, 2) not null default 0 check (qty_ordered >= 0),
  qty_received numeric(12, 2) not null default 0 check (qty_received >= 0),
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (purchase_order_id, line_no),
  constraint purchase_order_lines_received_lte_ordered check (qty_received <= qty_ordered)
);

create index if not exists purchase_order_lines_po_idx
  on public.purchase_order_lines (purchase_order_id, line_no);

-- Receive qty into products.stock_on_hand when SKU matches; log inventory_movements.
create or replace function public.rr_po_receive_line(
  p_line uuid,
  p_qty numeric,
  p_user_email text default ''
)
returns public.purchase_order_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  line public.purchase_order_lines;
  po public.purchase_orders;
  remaining numeric;
  prod_id uuid;
begin
  if not public.rr_is_staff() then
    raise exception 'Not allowed';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Receive quantity must be > 0';
  end if;

  select * into line from public.purchase_order_lines where id = p_line for update;
  if not found then raise exception 'PO line not found'; end if;
  if line.tenant_id is distinct from public.rr_my_tenant_id() then
    raise exception 'Wrong tenant';
  end if;

  select * into po from public.purchase_orders where id = line.purchase_order_id for update;
  if po.status in ('canceled', 'received') then
    raise exception 'Cannot receive on a % PO', po.status;
  end if;

  remaining := line.qty_ordered - line.qty_received;
  if p_qty > remaining then
    raise exception 'Receive qty exceeds remaining (%)', remaining;
  end if;

  update public.purchase_order_lines
    set qty_received = qty_received + p_qty
    where id = p_line
    returning * into line;

  if btrim(line.sku) <> '' then
    select id into prod_id from public.products where sku = line.sku limit 1;
    if prod_id is not null then
      update public.products
        set stock_on_hand = stock_on_hand + p_qty,
            updated_at = now()
        where id = prod_id;
      insert into public.inventory_movements (sku, qty_delta, reserved_delta, reason, reference, user_email)
      values (line.sku, p_qty, 0, 'po_receive', coalesce(nullif(po.po_number, ''), po.id::text), coalesce(p_user_email, ''));
    end if;
  end if;

  -- Roll up PO status
  if exists (
    select 1 from public.purchase_order_lines l
    where l.purchase_order_id = po.id and l.qty_received < l.qty_ordered
  ) then
    if exists (
      select 1 from public.purchase_order_lines l
      where l.purchase_order_id = po.id and l.qty_received > 0
    ) then
      update public.purchase_orders set status = 'partial', updated_at = now() where id = po.id;
    elsif po.status = 'draft' then
      update public.purchase_orders set status = 'ordered', updated_at = now() where id = po.id;
    end if;
  else
    update public.purchase_orders set status = 'received', updated_at = now() where id = po.id;
  end if;

  return line;
end;
$$;

revoke all on function public.rr_po_receive_line(uuid, numeric, text) from public;
grant execute on function public.rr_po_receive_line(uuid, numeric, text) to authenticated;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
revoke all on public.purchase_orders from anon, authenticated;
revoke all on public.purchase_order_lines from anon, authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_lines to authenticated;

do $$
declare t text;
begin
  foreach t in array array['purchase_orders', 'purchase_order_lines']
  loop
    execute format('drop policy if exists %I on public.%I', 'Members read ' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff write ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
         with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Staff write ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t);
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
  end loop;
end $$;

comment on table public.purchase_orders is 'M9: supplier purchase orders.';
comment on table public.purchase_order_lines is 'M9: PO lines; receive bumps product stock when SKU matches.';
