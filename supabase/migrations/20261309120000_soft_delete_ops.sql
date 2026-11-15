-- Soft-delete broaden: delivery projects + HR employees.

alter table public.delivery_projects add column if not exists deleted_at timestamptz;
alter table public.hr_employees add column if not exists deleted_at timestamptz;

create index if not exists delivery_projects_deleted_at_idx on public.delivery_projects (deleted_at);
create index if not exists hr_employees_deleted_at_idx on public.hr_employees (deleted_at);

comment on column public.delivery_projects.deleted_at is 'M13 soft-delete; null = active.';
comment on column public.hr_employees.deleted_at is 'M13 soft-delete; null = active.';
