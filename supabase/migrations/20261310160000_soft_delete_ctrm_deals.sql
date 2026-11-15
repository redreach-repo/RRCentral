-- M13 deepen: soft-delete on CTRM Next deals.

alter table public.ctrm_deals add column if not exists deleted_at timestamptz;

create index if not exists ctrm_deals_deleted_at_idx on public.ctrm_deals (deleted_at);

comment on column public.ctrm_deals.deleted_at is 'M13 soft-delete; null = active deal.';
