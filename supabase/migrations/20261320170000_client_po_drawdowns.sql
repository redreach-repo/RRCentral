-- Client POs: how much of each PO line has been invoiced, and what is left.
--
-- A client PO lists what the client ordered (e.g. 30 driver uniforms, 20 pump
-- operator uniforms, 40 helper uniforms). Each invoice raised against it takes
-- some of each line ("10 for drivers, 10 for pump operators, 20 for helpers").
-- This table keeps those quantities, so for every PO line RR Central shows:
--   requested (on the PO) - invoiced so far (all invoices not cancelled) = balance.
--
-- * client_po_drawdowns: one row per invoice per PO line, with the quantity
--   invoiced. Deleting the invoice or the PO deletes its rows.
-- * PO lines get a stable id inside client_purchase_orders.line_items, so a
--   drawdown keeps pointing at the same line when lines are edited or reordered.
--   Existing lines without one get one here.
--
-- Access (same as client_purchase_orders): admin / manager / sales read and
-- write in their own tenant; staff, viewer and other tenants none.
-- Changes no existing amounts. Safe to re-run.
-- Run after 20261320160000_client_po_file_and_details.sql.

do $$
begin
  if to_regclass('public.client_purchase_orders') is null then
    raise exception 'Run 20261230180000_client_purchase_orders.sql first (client_purchase_orders is missing).';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_purchase_orders' and column_name = 'line_items'
  ) then
    raise exception 'Run 20261320160000_client_po_file_and_details.sql first (client PO line items are missing).';
  end if;
end $$;

create table if not exists public.client_po_drawdowns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  po_id uuid not null references public.client_purchase_orders (id) on delete cascade,
  po_line_id text not null check (length(trim(po_line_id)) > 0),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  quantity numeric(12, 2) not null check (quantity > 0),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (invoice_id, po_id, po_line_id)
);

create index if not exists client_po_drawdowns_po_idx on public.client_po_drawdowns (po_id, po_line_id);
create index if not exists client_po_drawdowns_invoice_idx on public.client_po_drawdowns (invoice_id);

comment on table public.client_po_drawdowns is
  'Quantity of each client PO line taken by each invoice (requested - invoiced = balance).';

-- A drawdown always sits in the same tenant as its PO.
create or replace function public.rr_client_po_drawdown_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.tenant_id into new.tenant_id
  from public.client_purchase_orders p
  where p.id = new.po_id;
  return new;
end $$;

revoke all on function public.rr_client_po_drawdown_tenant() from public;

drop trigger if exists rr_client_po_drawdown_tenant on public.client_po_drawdowns;
create trigger rr_client_po_drawdown_tenant before insert or update of po_id on public.client_po_drawdowns
  for each row execute function public.rr_client_po_drawdown_tenant();

alter table public.client_po_drawdowns enable row level security;
revoke all on public.client_po_drawdowns from anon, authenticated;
grant select, insert, update, delete on public.client_po_drawdowns to authenticated;

-- Older catch-up scripts add blanket policies to every table; never here.
drop policy if exists "Staff full access" on public.client_po_drawdowns;
drop policy if exists "Viewers read" on public.client_po_drawdowns;
drop policy if exists "Authenticated users full access" on public.client_po_drawdowns;

drop policy if exists "Staff read and write client_po_drawdowns" on public.client_po_drawdowns;
create policy "Staff read and write client_po_drawdowns" on public.client_po_drawdowns
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.client_po_drawdowns;
create policy "Tenant isolation" on public.client_po_drawdowns
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

-- Give every existing PO line a stable id (only lines that have none).
update public.client_purchase_orders p
set line_items = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(l) = 'object' and coalesce(l->>'id', '') = ''
        then l || jsonb_build_object('id', gen_random_uuid()::text)
      else l
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(p.line_items) with ordinality as e(l, ord)
)
where exists (
  select 1 from jsonb_array_elements(p.line_items) l
  where jsonb_typeof(l) = 'object' and coalesce(l->>'id', '') = ''
);
