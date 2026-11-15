-- M13 deepen: soft-delete on CRM / follow-up deals.

alter table public.crm add column if not exists deleted_at timestamptz;

create index if not exists crm_deleted_at_idx on public.crm (deleted_at);

comment on column public.crm.deleted_at is 'M13 soft-delete; null = active.';
