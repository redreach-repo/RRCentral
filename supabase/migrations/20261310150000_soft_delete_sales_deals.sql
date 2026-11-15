-- M13 deepen: soft-delete on sales pipeline deals.

alter table public.sales_deals add column if not exists deleted_at timestamptz;

create index if not exists sales_deals_deleted_at_idx on public.sales_deals (deleted_at);

comment on column public.sales_deals.deleted_at is 'M13 soft-delete; null = active deal.';
