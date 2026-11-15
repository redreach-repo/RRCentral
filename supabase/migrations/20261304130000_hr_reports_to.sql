-- HR org-chart stub: reports_to manager link.

alter table public.hr_employees
  add column if not exists reports_to_id uuid references public.hr_employees (id) on delete set null;

create index if not exists hr_employees_reports_to_idx
  on public.hr_employees (reports_to_id);

comment on column public.hr_employees.reports_to_id is
  'Org-chart stub: manager employee id (no cycle enforcement beyond UI).';
