-- Client PO partial receipt stub (received_amount toward PO amount).

alter table public.client_purchase_orders
  add column if not exists received_amount numeric(14, 2) not null default 0
    check (received_amount >= 0);

comment on column public.client_purchase_orders.received_amount is
  'M9a deepen: amount received/fulfilled against the client PO (soft).';
