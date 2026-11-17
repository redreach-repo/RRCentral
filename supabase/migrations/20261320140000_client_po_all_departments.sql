-- Client POs for every department, not only the CRM accounts list.
--
-- Until now a client PO had to point at public.accounts, which on live only
-- holds the AI CRM / WorshipHub / CTRM accounts, so the Client POs page could
-- only offer those. Quotations and invoices for every department use
-- public.clients, so a PO can now point at a client from that list instead.
--
-- * client_id: the client from the company wide list (same as quotations / invoices).
-- * account_id: now optional (older rows keep theirs).
-- * division_code: optional department tag (01 RR Threads ... 09 CTRM).
-- * Every PO still needs a client or an account.
--
-- RLS: no new table. The existing policies on client_purchase_orders
-- (tenant isolation + admin / manager / sales) cover the new columns.
-- Safe to re-run. Run after 20261230180000_client_purchase_orders.sql.

do $$
begin
  if to_regclass('public.client_purchase_orders') is null then
    raise exception 'Run 20261230180000_client_purchase_orders.sql first (client_purchase_orders is missing).';
  end if;
end $$;

alter table public.client_purchase_orders
  add column if not exists client_id uuid references public.clients (id) on delete cascade;

alter table public.client_purchase_orders
  add column if not exists division_code text;

alter table public.client_purchase_orders
  alter column account_id drop not null;

alter table public.client_purchase_orders
  drop constraint if exists client_purchase_orders_party_check;
alter table public.client_purchase_orders
  add constraint client_purchase_orders_party_check
  check (client_id is not null or account_id is not null);

alter table public.client_purchase_orders
  drop constraint if exists client_purchase_orders_division_check;
alter table public.client_purchase_orders
  add constraint client_purchase_orders_division_check
  check (division_code is null or division_code ~ '^[0-9]{2}$');

create index if not exists client_purchase_orders_client_idx
  on public.client_purchase_orders (client_id);

create unique index if not exists client_purchase_orders_client_po_key
  on public.client_purchase_orders (tenant_id, client_id, po_number)
  where client_id is not null;

comment on column public.client_purchase_orders.client_id is
  'Client from the company wide clients list (any department).';
comment on column public.client_purchase_orders.division_code is
  'Optional department code (01 to 09), same codes as quotation / invoice references.';
comment on table public.client_purchase_orders is
  'M9a: customer PO numbers for any department, tracked against a client (or a legacy account).';
