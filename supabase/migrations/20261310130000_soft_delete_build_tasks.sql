-- M13 deepen: soft-delete on go-live / build checklist steps.

alter table public.build_tasks add column if not exists deleted_at timestamptz;

create index if not exists build_tasks_deleted_at_idx on public.build_tasks (deleted_at);

comment on column public.build_tasks.deleted_at is 'M13 soft-delete; null = active checklist step.';
