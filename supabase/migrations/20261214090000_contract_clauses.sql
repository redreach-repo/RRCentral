-- M5 clause library foundation: reusable contract/NDA clause wording.
-- Compose into templates later; obligations board is a follow-up slice.
-- Safe to re-run.

begin;

create table if not exists public.contract_clauses (
  id uuid primary key default uuid_generate_v4(),
  clause_key text not null,
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  category text not null default 'general'
    check (category in ('confidentiality', 'obligations', 'term', 'liability', 'general', 'other')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  sort_order integer not null default 100,
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_clauses_key_format check (clause_key ~ '^[a-z][a-z0-9_]{1,62}$')
);

create unique index if not exists contract_clauses_key_uidx
  on public.contract_clauses (clause_key);

create index if not exists contract_clauses_category_idx
  on public.contract_clauses (category, sort_order);

create index if not exists contract_clauses_status_idx
  on public.contract_clauses (status);

alter table public.contract_clauses enable row level security;
revoke all on public.contract_clauses from anon;
grant select on public.contract_clauses to authenticated;
grant insert, update, delete on public.contract_clauses to authenticated;

drop policy if exists "Staff read contract clauses" on public.contract_clauses;
drop policy if exists "Managers edit contract clauses" on public.contract_clauses;
create policy "Staff read contract clauses" on public.contract_clauses
  for select to authenticated using (public.rr_is_staff());
create policy "Managers edit contract clauses" on public.contract_clauses
  for all to authenticated
  using (public.rr_is_manager_or_admin())
  with check (public.rr_is_manager_or_admin());

insert into public.contract_clauses (clause_key, title, body, category, status, sort_order, created_by)
select * from (values
  (
    'confidentiality_def',
    'Definition of Confidential Information',
    'Confidential Information means non-public information disclosed by one party to the other in connection with discussions or work, whether oral, written or electronic, that is marked confidential or that a reasonable person would understand to be confidential.',
    'confidentiality',
    'active',
    10,
    'system'
  ),
  (
    'recipient_obligations',
    'Recipient obligations',
    'The Recipient shall use Confidential Information only for the stated purpose, protect it with reasonable care, and not disclose it to third parties except to personnel or advisors who need it and are bound by confidentiality duties at least as protective as this clause.',
    'obligations',
    'active',
    20,
    'system'
  ),
  (
    'term_survive',
    'Term and survival',
    'This agreement starts on the effective date and continues for the stated term unless ended earlier in writing. Confidentiality obligations survive for the stated survival period after disclosure of the relevant information.',
    'term',
    'active',
    30,
    'system'
  )
) as seed(clause_key, title, body, category, status, sort_order, created_by)
where not exists (select 1 from public.contract_clauses limit 1);

notify pgrst, 'reload schema';

commit;
