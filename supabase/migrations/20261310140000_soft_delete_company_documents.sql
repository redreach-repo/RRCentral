-- M13 deepen: soft-delete on company papers (trade licence, VAT, etc.).

alter table public.company_documents add column if not exists deleted_at timestamptz;

create index if not exists company_documents_deleted_at_idx on public.company_documents (deleted_at);

comment on column public.company_documents.deleted_at is 'M13 soft-delete; null = active. File stays on Drive.';
