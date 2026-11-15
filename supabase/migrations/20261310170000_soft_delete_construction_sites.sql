-- Soft-delete: construction sites.

alter table public.construction_sites add column if not exists deleted_at timestamptz;

create index if not exists construction_sites_deleted_at_idx on public.construction_sites (deleted_at);

comment on column public.construction_sites.deleted_at is 'M13 soft-delete; null = active.';
