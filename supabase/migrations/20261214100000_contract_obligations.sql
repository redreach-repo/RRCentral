-- M5 obligations board: track follow-through from signed NDAs / agreements.
-- Safe to re-run.

begin;

create table if not exists public.contract_obligations (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null default '',
  crm_id text not null default '',
  legal_document_id uuid references public.legal_documents(id) on delete set null,
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  owner_party text not null default 'red_reach'
    check (owner_party in ('red_reach', 'counterparty', 'both')),
  due_date date,
  status text not null default 'open'
    check (status in ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_obligations_done check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  )
);

create index if not exists contract_obligations_status_idx
  on public.contract_obligations (status, due_date);
create index if not exists contract_obligations_company_idx
  on public.contract_obligations (lower(company_name));
create index if not exists contract_obligations_crm_idx
  on public.contract_obligations (crm_id);
create index if not exists contract_obligations_doc_idx
  on public.contract_obligations (legal_document_id);

alter table public.contract_obligations enable row level security;
revoke all on public.contract_obligations from anon;
grant select, insert, update, delete on public.contract_obligations to authenticated;

drop policy if exists "Staff manage contract obligations" on public.contract_obligations;
create policy "Staff manage contract obligations" on public.contract_obligations
  for all to authenticated
  using (public.rr_is_staff())
  with check (public.rr_is_staff());

notify pgrst, 'reload schema';

commit;
