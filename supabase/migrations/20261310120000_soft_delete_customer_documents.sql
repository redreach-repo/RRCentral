-- M13 deepen: soft-delete on customer document Drive links.

alter table public.customer_documents add column if not exists deleted_at timestamptz;

create index if not exists customer_documents_deleted_at_idx on public.customer_documents (deleted_at);

comment on column public.customer_documents.deleted_at is 'M13 soft-delete; null = active. File stays on Drive.';
