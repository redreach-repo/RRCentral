-- M13 deepen: soft-delete on customer payments.

alter table public.customer_payments add column if not exists deleted_at timestamptz;

create index if not exists customer_payments_deleted_at_idx on public.customer_payments (deleted_at);

comment on column public.customer_payments.deleted_at is 'M13 soft-delete; null = active.';
