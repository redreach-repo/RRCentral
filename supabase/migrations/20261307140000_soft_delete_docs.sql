-- Soft-delete on money/docs lists.

alter table public.quotations add column if not exists deleted_at timestamptz;
alter table public.invoices add column if not exists deleted_at timestamptz;
alter table public.delivery_notes add column if not exists deleted_at timestamptz;
alter table public.purchase_orders add column if not exists deleted_at timestamptz;

create index if not exists quotations_deleted_at_idx on public.quotations (deleted_at);
create index if not exists invoices_deleted_at_idx on public.invoices (deleted_at);
create index if not exists delivery_notes_deleted_at_idx on public.delivery_notes (deleted_at);
create index if not exists purchase_orders_deleted_at_idx on public.purchase_orders (deleted_at);
