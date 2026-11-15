-- Soft-delete: engineering document register + claims.

alter table public.eng_document_registers add column if not exists deleted_at timestamptz;
alter table public.eng_claims add column if not exists deleted_at timestamptz;

create index if not exists eng_document_registers_deleted_at_idx
  on public.eng_document_registers (deleted_at);
create index if not exists eng_claims_deleted_at_idx
  on public.eng_claims (deleted_at);

comment on column public.eng_document_registers.deleted_at is 'M13 soft-delete; null = active.';
comment on column public.eng_claims.deleted_at is 'M13 soft-delete; null = active.';
