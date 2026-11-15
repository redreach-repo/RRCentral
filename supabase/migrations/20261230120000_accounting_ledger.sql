-- M7 accounting core: chart of accounts + double-entry journals.
-- Additive only. Posted journals are immutable (no update/delete of lines or header).
-- Default CoA is a UAE SME starter — tax mapping Unverified (see COMPLIANCE_NOTES).

------------------------------------------------------------
-- Chart of accounts
------------------------------------------------------------
create table if not exists public.gl_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  code text not null,
  name text not null,
  account_type text not null
    check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_postable boolean not null default true,
  is_active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists gl_accounts_tenant_idx
  on public.gl_accounts (tenant_id, account_type, code);

------------------------------------------------------------
-- Journals
------------------------------------------------------------
create table if not exists public.gl_journals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  journal_number text not null default '',
  entry_date date not null default current_date,
  memo text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'posted', 'void')),
  source_type text not null default 'manual',
  source_id text not null default '',
  created_by uuid references public.app_users (id) on delete set null,
  posted_by uuid references public.app_users (id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gl_journals_tenant_number_uidx
  on public.gl_journals (tenant_id, journal_number)
  where journal_number <> '';

create index if not exists gl_journals_tenant_idx
  on public.gl_journals (tenant_id, entry_date desc, status);

create table if not exists public.gl_journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  journal_id uuid not null references public.gl_journals (id) on delete cascade,
  account_id uuid not null references public.gl_accounts (id) on delete restrict,
  line_no int not null default 1 check (line_no > 0),
  memo text not null default '',
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  constraint gl_journal_lines_one_side check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  ),
  unique (journal_id, line_no)
);

create index if not exists gl_journal_lines_journal_idx
  on public.gl_journal_lines (journal_id, line_no);
create index if not exists gl_journal_lines_account_idx
  on public.gl_journal_lines (account_id);

------------------------------------------------------------
-- Immutability + balance helpers
------------------------------------------------------------
create or replace function public.rr_gl_journal_is_posted(p_journal uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.gl_journals j
    where j.id = p_journal and j.status = 'posted'
  );
$$;

create or replace function public.rr_gl_assert_draft_mutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if public.rr_gl_journal_is_posted(old.journal_id) then
      raise exception 'Posted journal lines cannot be deleted';
    end if;
    return old;
  end if;
  if public.rr_gl_journal_is_posted(new.journal_id)
     or (tg_op = 'UPDATE' and public.rr_gl_journal_is_posted(old.journal_id)) then
    raise exception 'Posted journal lines cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists rr_gl_lines_immutable on public.gl_journal_lines;
create trigger rr_gl_lines_immutable
  before update or delete on public.gl_journal_lines
  for each row execute function public.rr_gl_assert_draft_mutable();

create or replace function public.rr_gl_assert_journal_header_mutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'Posted journals cannot be deleted';
    end if;
    return old;
  end if;
  if old.status = 'posted' and (
       new.entry_date is distinct from old.entry_date
    or new.memo is distinct from old.memo
    or new.journal_number is distinct from old.journal_number
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or (new.status = 'draft' and old.status = 'posted')
  ) then
    raise exception 'Posted journals cannot be edited (void with a reversing entry)';
  end if;
  return new;
end;
$$;

drop trigger if exists rr_gl_journals_immutable on public.gl_journals;
create trigger rr_gl_journals_immutable
  before update or delete on public.gl_journals
  for each row execute function public.rr_gl_assert_journal_header_mutable();

create or replace function public.rr_gl_journal_balanced(p_journal uuid)
returns boolean
language sql
stable
as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0)
    and coalesce(sum(debit), 0) > 0
  from public.gl_journal_lines
  where journal_id = p_journal;
$$;

create or replace function public.rr_gl_post_journal(p_journal uuid)
returns public.gl_journals
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.gl_journals;
begin
  select * into j from public.gl_journals where id = p_journal for update;
  if not found then
    raise exception 'Journal not found';
  end if;
  if j.tenant_id is distinct from public.rr_my_tenant_id() then
    raise exception 'Wrong tenant';
  end if;
  if not public.rr_is_manager_or_admin() then
    raise exception 'Only managers or admins can post journals';
  end if;
  if j.status <> 'draft' then
    raise exception 'Only draft journals can be posted';
  end if;
  if not public.rr_gl_journal_balanced(p_journal) then
    raise exception 'Journal is not balanced (debits must equal credits and be > 0)';
  end if;
  update public.gl_journals
    set status = 'posted',
        posted_at = now(),
        posted_by = public.rr_current_user_id(),
        updated_at = now()
    where id = p_journal
    returning * into j;
  return j;
end;
$$;

revoke all on function public.rr_gl_post_journal(uuid) from public;
grant execute on function public.rr_gl_post_journal(uuid) to authenticated;

------------------------------------------------------------
-- Seed default CoA for Red Reach (idempotent)
------------------------------------------------------------
insert into public.gl_accounts (tenant_id, code, name, account_type, notes) values
  ('a0000000-0000-4000-8000-000000000001', '1000', 'Cash', 'asset', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '1100', 'Bank', 'asset', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '1200', 'Accounts receivable', 'asset', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '2000', 'Accounts payable', 'liability', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '2100', 'VAT payable', 'liability', 'Unverified — confirm with accountant'),
  ('a0000000-0000-4000-8000-000000000001', '3000', 'Owner equity', 'equity', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '4000', 'Sales revenue', 'revenue', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '5000', 'Cost of sales', 'expense', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '6000', 'Operating expenses', 'expense', 'Unverified starter CoA'),
  ('a0000000-0000-4000-8000-000000000001', '6100', 'Salaries', 'expense', 'Unverified starter CoA')
on conflict (tenant_id, code) do nothing;

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.gl_accounts enable row level security;
alter table public.gl_journals enable row level security;
alter table public.gl_journal_lines enable row level security;

revoke all on public.gl_accounts from anon, authenticated;
revoke all on public.gl_journals from anon, authenticated;
revoke all on public.gl_journal_lines from anon, authenticated;
grant select, insert, update, delete on public.gl_accounts to authenticated;
grant select, insert, update, delete on public.gl_journals to authenticated;
grant select, insert, update, delete on public.gl_journal_lines to authenticated;

drop policy if exists "Managers read gl_accounts" on public.gl_accounts;
create policy "Managers read gl_accounts" on public.gl_accounts
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Managers write gl_accounts" on public.gl_accounts;
create policy "Managers write gl_accounts" on public.gl_accounts
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Tenant isolation" on public.gl_accounts;
create policy "Tenant isolation" on public.gl_accounts
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Managers read gl_journals" on public.gl_journals;
create policy "Managers read gl_journals" on public.gl_journals
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Managers write gl_journals" on public.gl_journals;
create policy "Managers write gl_journals" on public.gl_journals
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Tenant isolation" on public.gl_journals;
create policy "Tenant isolation" on public.gl_journals
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Managers read gl_journal_lines" on public.gl_journal_lines;
create policy "Managers read gl_journal_lines" on public.gl_journal_lines
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Managers write gl_journal_lines" on public.gl_journal_lines;
create policy "Managers write gl_journal_lines" on public.gl_journal_lines
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Tenant isolation" on public.gl_journal_lines;
create policy "Tenant isolation" on public.gl_journal_lines
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

-- security_rls migration re-adds broad staff policies on every apply; strip them.
drop policy if exists "Staff full access" on public.gl_accounts;
drop policy if exists "Viewers read" on public.gl_accounts;
drop policy if exists "Staff full access" on public.gl_journals;
drop policy if exists "Viewers read" on public.gl_journals;
drop policy if exists "Staff full access" on public.gl_journal_lines;
drop policy if exists "Viewers read" on public.gl_journal_lines;

comment on table public.gl_accounts is 'M7: chart of accounts (starter CoA Unverified for tax).';
comment on table public.gl_journals is 'M7: journal headers; posted rows are immutable.';
comment on table public.gl_journal_lines is 'M7: journal lines; debit or credit, not both.';
