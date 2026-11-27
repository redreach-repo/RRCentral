-- Supplier advances (Alfred 2026-11-27): money paid to a vendor before their
-- bill arrives, recorded under Finance > Money out.
--
-- * supplier_advances               one row per advance: vendor, the client PO
--                                   and the quotation it is for, date paid,
--                                   amount (AED), method, bank reference, notes.
--                                   Every advance must point at a client PO and
--                                   a quotation. When the PO is already linked
--                                   to its quote, the quote is filled in from it.
-- * supplier_advance_applications   when the vendor's bill (an Expenses row)
--                                   arrives, the advance is applied against it.
--                                   An advance can be split over several bills
--                                   and a bill can take several advances, but
--                                   never more than either one's amount.
--
-- What is "open": amount minus what has been applied. The app counts the open
-- part as money out on its paid date (Dashboard, Reports P&L and the client PO
-- margin), and the bill carries the cost once applied, so nothing is counted
-- twice. Advances are not in the VAT return (no tax invoice yet).
--
-- Access (same as Expenses):
--   admin / manager / sales  read, add, change, apply to bills
--   viewer                   read only
--   staff                    no access (they cannot see Expenses either)
--   delete                   admin / manager only
-- Plus tenant isolation. The tenant always comes from the client PO.
-- AI connector keys: read only (finance department, like Expenses); they never
-- add, change, apply or remove an advance.
--
-- Changes to existing data: none. Safe to re-run.
-- Run after the client PO SQL (client_purchase_orders with quotation_id).
--
-- To reverse:
--   drop table if exists public.supplier_advance_applications;
--   drop table if exists public.supplier_advances;
--   drop function if exists public.rr_supplier_advance_stamp();
--   drop function if exists public.rr_supplier_advance_apply_check();

set client_min_messages = warning;

do $$
begin
  if to_regclass('public.client_purchase_orders') is null
     or to_regclass('public.quotations') is null
     or to_regclass('public.expenses') is null
     or to_regclass('public.vendors') is null then
    raise exception 'Run the client PO, quotation, expense and vendor SQL first (a table is missing).';
  end if;
end $$;

-- Older live databases may not have the PO -> quote link yet.
alter table public.client_purchase_orders
  add column if not exists quotation_id uuid references public.quotations (id) on delete set null;

------------------------------------------------------------
-- 1. Advances
------------------------------------------------------------
create table if not exists public.supplier_advances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  vendor_id uuid references public.vendors (id) on delete set null,
  vendor_name text not null check (length(trim(vendor_name)) > 0),
  client_po_id uuid not null references public.client_purchase_orders (id) on delete restrict,
  quotation_id uuid references public.quotations (id) on delete set null,
  quote_reference text not null default '',
  paid_on date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'AED' check (currency = 'AED'),
  payment_method text not null default '',
  reference text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_advances_tenant_idx
  on public.supplier_advances (tenant_id, paid_on desc);
create index if not exists supplier_advances_po_idx
  on public.supplier_advances (client_po_id);
create index if not exists supplier_advances_quote_idx
  on public.supplier_advances (quotation_id) where quotation_id is not null;
create index if not exists supplier_advances_vendor_idx
  on public.supplier_advances (lower(vendor_name));

comment on table public.supplier_advances is
  'Money paid to a vendor before their bill arrives; linked to a client PO and its quotation.';
comment on column public.supplier_advances.quote_reference is
  'Quote number when the advance was saved (kept if the quote is archived); matches expenses.quote_ref.';

------------------------------------------------------------
-- 2. Advances applied to vendor bills
------------------------------------------------------------
create table if not exists public.supplier_advance_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  advance_id uuid not null references public.supplier_advances (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  applied_on date not null default current_date,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (advance_id, expense_id)
);

create index if not exists supplier_advance_applications_expense_idx
  on public.supplier_advance_applications (expense_id);
create index if not exists supplier_advance_applications_tenant_idx
  on public.supplier_advance_applications (tenant_id);

comment on table public.supplier_advance_applications is
  'How much of a supplier advance was used against a vendor bill (expenses row).';

------------------------------------------------------------
-- 3. Stamps and checks
------------------------------------------------------------
-- Advance: tenant from the client PO; quote from the PO when not given; quote
-- number from the quote; who from the session. The amount cannot go below what
-- is already applied to bills.
create or replace function public.rr_supplier_advance_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  po record;
  q record;
  v_tenant uuid;
  applied numeric;
begin
  select p.id, p.tenant_id, p.quotation_id into po
  from public.client_purchase_orders p where p.id = new.client_po_id;
  if po.id is null then
    raise exception 'Pick the client PO this advance is for.';
  end if;
  new.tenant_id := po.tenant_id;

  if new.quotation_id is null then
    new.quotation_id := po.quotation_id;
  end if;
  if new.quotation_id is null then
    raise exception 'Pick the quotation this advance is for (the client PO is not linked to one yet).';
  end if;
  select x.id, x.tenant_id, x.reference_number, x.quote_id into q
  from public.quotations x where x.id = new.quotation_id;
  if q.id is null or coalesce(q.tenant_id, new.tenant_id) <> new.tenant_id then
    raise exception 'That quotation is not in this workspace.';
  end if;
  new.quote_reference := coalesce(nullif(trim(q.reference_number), ''), nullif(trim(q.quote_id), ''), '');

  if new.vendor_id is not null then
    select v.tenant_id into v_tenant from public.vendors v where v.id = new.vendor_id;
    if not found or coalesce(v_tenant, new.tenant_id) <> new.tenant_id then
      raise exception 'That vendor is not in this workspace.';
    end if;
  end if;
  new.vendor_name := trim(new.vendor_name);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.rr_current_email(), '');
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    select coalesce(sum(a.amount), 0) into applied
    from public.supplier_advance_applications a where a.advance_id = new.id;
    if new.amount < applied then
      raise exception 'This advance is already applied to bills for AED %; the amount cannot be less.', applied;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.rr_supplier_advance_stamp() from public;

drop trigger if exists rr_supplier_advance_stamp on public.supplier_advances;
create trigger rr_supplier_advance_stamp before insert or update on public.supplier_advances
  for each row execute function public.rr_supplier_advance_stamp();

-- Application: tenant from the advance; the bill must be in the same tenant
-- and not canceled; never more than the advance has open or the bill's total.
create or replace function public.rr_supplier_advance_apply_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  adv record;
  exp record;
  used_adv numeric;
  used_exp numeric;
begin
  -- Lock the advance so two people applying at once cannot overspend it.
  select a.id, a.tenant_id, a.amount into adv
  from public.supplier_advances a where a.id = new.advance_id for update;
  if adv.id is null then
    raise exception 'That advance does not exist.';
  end if;
  new.tenant_id := adv.tenant_id;

  select e.id, coalesce(e.tenant_id, 'a0000000-0000-4000-8000-000000000001'::uuid) as tenant_id,
         e.amount, e.status
    into exp
  from public.expenses e where e.id = new.expense_id for update;
  if exp.id is null or exp.tenant_id <> adv.tenant_id then
    raise exception 'That bill is not in this workspace.';
  end if;
  if exp.status = 'Canceled' then
    raise exception 'That bill is canceled.';
  end if;

  select coalesce(sum(x.amount), 0) into used_adv
  from public.supplier_advance_applications x
  where x.advance_id = new.advance_id and x.id <> new.id;
  if used_adv + new.amount > adv.amount then
    raise exception 'Only AED % of this advance is left to apply.', adv.amount - used_adv;
  end if;

  select coalesce(sum(x.amount), 0) into used_exp
  from public.supplier_advance_applications x
  where x.expense_id = new.expense_id and x.id <> new.id;
  if used_exp + new.amount > exp.amount then
    raise exception 'That bill only has AED % left to cover.', greatest(exp.amount - used_exp, 0);
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(public.rr_current_email(), '');
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

revoke all on function public.rr_supplier_advance_apply_check() from public;

drop trigger if exists rr_supplier_advance_apply_check on public.supplier_advance_applications;
create trigger rr_supplier_advance_apply_check before insert or update on public.supplier_advance_applications
  for each row execute function public.rr_supplier_advance_apply_check();

------------------------------------------------------------
-- 4. Row level security
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['supplier_advances', 'supplier_advance_applications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    -- Older catch-up scripts add a blanket policy to every table; remove it here.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Authenticated users full access" on public.%I', t);

    execute format('drop policy if exists "Staff read" on public.%I', t);
    execute format(
      'create policy "Staff read" on public.%I for select to authenticated
         using (public.rr_is_staff())', t);

    execute format('drop policy if exists "Viewers read" on public.%I', t);
    execute format(
      'create policy "Viewers read" on public.%I for select to authenticated
         using (public.rr_current_role() = ''viewer'')', t);

    execute format('drop policy if exists "Staff insert" on public.%I', t);
    execute format(
      'create policy "Staff insert" on public.%I for insert to authenticated
         with check (public.rr_is_staff())', t);

    execute format('drop policy if exists "Staff update" on public.%I', t);
    execute format(
      'create policy "Staff update" on public.%I for update to authenticated
         using (public.rr_is_staff()) with check (public.rr_is_staff())', t);

    execute format('drop policy if exists "Managers delete" on public.%I', t);
    execute format(
      'create policy "Managers delete" on public.%I for delete to authenticated
         using (public.rr_is_manager_or_admin())', t);

    execute format('drop policy if exists "Tenant isolation" on public.%I', t);
    execute format(
      'create policy "Tenant isolation" on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id))', t);

    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
    ) then
      execute format('drop trigger if exists rr_audit on public.%I', t);
      execute format(
        'create trigger rr_audit after insert or update or delete on public.%I
           for each row execute function public.rr_audit_trigger()', t);
    end if;
  end loop;
end $$;

------------------------------------------------------------
-- 5. AI connector (MCP): read only, finance department
------------------------------------------------------------
do $$
declare
  t text;
begin
  if to_regprocedure('public.rr_mcp_key_id()') is null then
    return;
  end if;
  foreach t in array array['supplier_advances', 'supplier_advance_applications'] loop
    execute format('drop policy if exists "AI never writes supplier advances" on public.%I', t);
    execute format(
      'create policy "AI never writes supplier advances" on public.%I as restrictive for all to authenticated
         using (true) with check (public.rr_mcp_key_id() is null)', t);
    execute format('drop policy if exists "MCP never deletes" on public.%I', t);
    execute format(
      'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
         using (public.rr_mcp_key_id() is null)', t);

    -- Keys with departments read these like Expenses (finance only).
    execute format('drop policy if exists "MCP department reach" on public.%I', t);
    if to_regprocedure('public.rr_mcp_dept_allows(text, boolean)') is not null then
      execute format(
        'create policy "MCP department reach" on public.%I as restrictive for select to authenticated
           using ((select public.rr_mcp_dept_allows(''expenses'', false)))', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
