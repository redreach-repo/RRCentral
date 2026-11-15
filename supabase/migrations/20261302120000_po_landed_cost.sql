-- M9 deepen: PO header landed cost (freight/duty) allocated into unit_cost on receive.

alter table public.purchase_orders
  add column if not exists landed_cost_aed numeric(14, 2) not null default 0
    check (landed_cost_aed >= 0);

alter table public.purchase_order_lines
  add column if not exists landed_unit_cost numeric(14, 2) not null default 0
    check (landed_unit_cost >= 0);

comment on column public.purchase_orders.landed_cost_aed is
  'Extra freight/duty/customs AED to allocate across received qty (Unverified).';

-- Replace receive function to roll freight into effective unit cost for inventory.
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
  total_ordered numeric;
  share numeric;
  effective_unit numeric;
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

  select coalesce(sum(qty_ordered), 0) into total_ordered
  from public.purchase_order_lines
  where purchase_order_id = po.id;

  share := case
    when total_ordered > 0 and po.landed_cost_aed > 0 then (po.landed_cost_aed / total_ordered)
    else 0
  end;
  effective_unit := coalesce(line.unit_cost, 0) + share;

  update public.purchase_order_lines
    set qty_received = qty_received + p_qty,
        landed_unit_cost = effective_unit
    where id = p_line
    returning * into line;

  if btrim(line.sku) <> '' then
    select id into prod_id from public.products where sku = line.sku limit 1;
    if prod_id is not null then
      update public.products
        set stock_on_hand = stock_on_hand + p_qty,
            unit_cost = case when effective_unit > 0 then effective_unit else unit_cost end,
            updated_at = now()
        where id = prod_id;
      insert into public.inventory_movements (sku, qty_delta, reserved_delta, reason, reference, user_email)
      values (line.sku, p_qty, 0, 'po_receive', coalesce(nullif(po.po_number, ''), po.id::text), coalesce(p_user_email, ''));
    end if;
  end if;

  -- Roll up PO status (same rules as M9)
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
