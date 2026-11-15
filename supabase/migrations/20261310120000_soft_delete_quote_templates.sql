-- Soft-delete: quote templates (archive/restore instead of hard delete).

alter table public.quote_templates add column if not exists deleted_at timestamptz;

create index if not exists quote_templates_deleted_at_idx on public.quote_templates (deleted_at);

comment on column public.quote_templates.deleted_at is 'M13 soft-delete; null = active.';
