-- M13 deepen: soft-delete on expenses + tickets.

alter table public.expenses add column if not exists deleted_at timestamptz;
alter table public.tickets add column if not exists deleted_at timestamptz;

create index if not exists expenses_deleted_at_idx on public.expenses (deleted_at);
create index if not exists tickets_deleted_at_idx on public.tickets (deleted_at);

comment on column public.expenses.deleted_at is 'M13 soft-delete; null = active.';
comment on column public.tickets.deleted_at is 'M13 soft-delete; null = active.';
