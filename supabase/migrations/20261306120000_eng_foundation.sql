-- M12a engineering pack: document register + claims stubs.

create table if not exists public.eng_document_registers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  doc_no text not null default '',
  title text not null,
  discipline text not null default '',
  revision text not null default 'A',
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'superseded', 'void')),
  issued_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.eng_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  claim_no text not null default '',
  title text not null,
  amount_aed numeric(14, 2) not null default 0 check (amount_aed >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'withdrawn')),
  submitted_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eng_document_registers_tenant_idx
  on public.eng_document_registers (tenant_id, status);
create index if not exists eng_claims_tenant_idx
  on public.eng_claims (tenant_id, status);

alter table public.eng_document_registers enable row level security;
alter table public.eng_claims enable row level security;
revoke all on public.eng_document_registers from anon, authenticated;
revoke all on public.eng_claims from anon, authenticated;
grant select, insert, update, delete on public.eng_document_registers to authenticated;
grant select, insert, update, delete on public.eng_claims to authenticated;

drop policy if exists "Members read eng_document_registers" on public.eng_document_registers;
create policy "Members read eng_document_registers" on public.eng_document_registers
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write eng_document_registers" on public.eng_document_registers;
create policy "Staff write eng_document_registers" on public.eng_document_registers
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.eng_document_registers;
create policy "Tenant isolation" on public.eng_document_registers
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Members read eng_claims" on public.eng_claims;
create policy "Members read eng_claims" on public.eng_claims
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write eng_claims" on public.eng_claims;
create policy "Staff write eng_claims" on public.eng_claims
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.eng_claims;
create policy "Tenant isolation" on public.eng_claims
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

comment on table public.eng_document_registers is 'M12a engineering document register stub.';
comment on table public.eng_claims is 'M12a engineering claims stub — not contractual advice.';
