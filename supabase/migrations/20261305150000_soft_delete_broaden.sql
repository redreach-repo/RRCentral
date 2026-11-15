-- M13 deepen: soft-delete columns on vendors + products.

alter table public.vendors add column if not exists deleted_at timestamptz;
alter table public.products add column if not exists deleted_at timestamptz;

create index if not exists vendors_deleted_at_idx on public.vendors (deleted_at);
create index if not exists products_deleted_at_idx on public.products (deleted_at);

comment on column public.vendors.deleted_at is 'M13 soft-delete; null = active.';
comment on column public.products.deleted_at is 'M13 soft-delete; null = active.';
