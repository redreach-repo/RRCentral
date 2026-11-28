-- Link documents to a real client record (HighMast brief fix 3, part 1;
-- Alfred 2026-11-28).
--
-- Quotes, invoices, delivery notes, payments, company pipeline deals (crm),
-- support tickets and website enquiries store the client as free text. This
-- adds a real link, client_id -> clients.id, next to that text. The text is
-- never changed, so quote and invoice numbers, totals and PDFs stay exactly as
-- they are.
--
-- How a row gets its client_id:
--   * the app (or a person) sets it, or
--   * on save, the row is matched to exactly one client of the same company
--     (tenant): by the account it is linked to, then the exact name, then the
--     normalized name ("Al Noor Trading L.L.C." = "al noor"), then the
--     contact email. Two or more possible clients = no link (never guessed);
--   * when a client is added or renamed, unlinked rows with that exact or
--     normalized name are linked to it, if it is the only match.
-- An existing link is only redone when the row's client name (or account)
-- changes; other saves never touch it.
--
-- Existing records: this file runs rr_link_clients(true) once, which fills
-- empty client_id only where there is exactly one match, and logs each link
-- in client_link_log under one batch id. Anything ambiguous or unmatched is
-- left empty and listed on Duplicates > Documents to link for a manager to
-- pick the client. Undo a batch: select public.rr_unlink_clients('<batch id>').
--
-- Access: reading and setting client_id follow each table's existing rules.
-- rr_link_clients / rr_set_document_client: admins and managers (and the SQL
-- editor). The AI connector cannot call them. Sales users still reach only
-- their own clients; a document linked to one of their clients now counts as
-- theirs too (same as a matching name did before).
--
-- Safe to re-run.
--
-- To reverse:
--   drop function if exists public.rr_set_document_client(text, uuid, uuid);
--   drop function if exists public.rr_unlink_clients(uuid);
--   drop function if exists public.rr_link_clients(boolean);
--   drop trigger if exists rr_client_link_orphans on public.clients;
--   drop function if exists public.rr_client_link_orphans();
--   (for each table below) drop trigger if exists rr_client_link_stamp on public.<table>;
--   drop function if exists public.rr_client_link_stamp();
--   drop function if exists public.rr_client_match(uuid, text, text, uuid);
--   drop table if exists public.client_link_log;
--   (for each table below) alter table public.<table> drop column if exists client_id;
--   and re-run 20261332090000_sales_own_clients.sql section 4 for the Sales helpers.

do $$
begin
  if to_regclass('public.clients') is null or to_regclass('public.tenants') is null then
    raise exception 'Run the platform tenancy migration first (clients or tenants is missing).';
  end if;
  if to_regprocedure('public.rr_normalize_company_name(text)') is null then
    raise exception 'Run 20261023090000_accounts_foundation.sql first (rr_normalize_company_name is missing).';
  end if;
end $$;

------------------------------------------------------------
-- 1. client_id on every document that names a client
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'tickets', 'website_inquiries'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'client links: % missing, skipped', t;
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists client_id uuid references public.clients (id) on delete set null', t);
    execute format('create index if not exists %I on public.%I (client_id)', t || '_client_id_idx', t);
  end loop;
end $$;

------------------------------------------------------------
-- 2. One client for a name / email / account, or none
------------------------------------------------------------
-- match: account | exact | normalized | email | ambiguous | none
create or replace function public.rr_client_match(p_tenant uuid, p_name text, p_email text, p_account uuid)
returns table (client_id uuid, match text, candidates integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := lower(btrim(coalesce(p_name, '')));
  v_key text := public.rr_normalize_company_name(p_name);
  v_email text := lower(btrim(coalesce(p_email, '')));
  ids uuid[];
begin
  if p_account is not null then
    select coalesce(array_agg(c.id), '{}') into ids
    from public.clients c
    where c.account_id = p_account and c.tenant_id is not distinct from p_tenant;
    if cardinality(ids) = 1 then
      return query select ids[1], 'account'::text, 1;
      return;
    end if;
  end if;

  if v_name <> '' then
    select coalesce(array_agg(c.id), '{}') into ids
    from public.clients c
    where lower(btrim(c.company_name)) = v_name and c.tenant_id is not distinct from p_tenant;
    if cardinality(ids) = 1 then
      return query select ids[1], 'exact'::text, 1;
      return;
    elsif cardinality(ids) > 1 then
      return query select null::uuid, 'ambiguous'::text, cardinality(ids);
      return;
    end if;
  end if;

  if v_key <> '' then
    select coalesce(array_agg(c.id), '{}') into ids
    from public.clients c
    where public.rr_normalize_company_name(c.company_name) = v_key and c.tenant_id is not distinct from p_tenant;
    if cardinality(ids) = 1 then
      return query select ids[1], 'normalized'::text, 1;
      return;
    elsif cardinality(ids) > 1 then
      return query select null::uuid, 'ambiguous'::text, cardinality(ids);
      return;
    end if;
  end if;

  if v_email ~ '^[^@\s]+@[^@\s]+$' then
    select coalesce(array_agg(distinct c.id), '{}') into ids
    from public.clients c
    where c.tenant_id is not distinct from p_tenant
      and (lower(btrim(c.email)) = v_email
        or exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(c.contacts) = 'array' then c.contacts else '[]'::jsonb end) e
          where lower(btrim(coalesce(e ->> 'email', ''))) = v_email));
    if cardinality(ids) = 1 then
      return query select ids[1], 'email'::text, 1;
      return;
    elsif cardinality(ids) > 1 then
      return query select null::uuid, 'ambiguous'::text, cardinality(ids);
      return;
    end if;
  end if;

  return query select null::uuid, 'none'::text, 0;
end $$;

revoke all on function public.rr_client_match(uuid, text, text, uuid) from public, anon, authenticated;

------------------------------------------------------------
-- 3. Stamp client_id on save
------------------------------------------------------------
create or replace function public.rr_client_link_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  name_col text := case tg_table_name
    when 'crm' then 'company_name'
    when 'website_inquiries' then 'company'
    when 'tickets' then null
    else 'client' end;
  email_col text := case tg_table_name
    when 'crm' then 'email_phone'
    when 'website_inquiries' then 'email'
    when 'tickets' then 'requester_email'
    else null end;
  v_tenant uuid := nullif(n ->> 'tenant_id', '')::uuid;
  v_client_tenant uuid;
  v_match record;
  v_from_invoice uuid;
begin
  -- Set by the app or a person: check it is a client of the same company.
  if new.client_id is not null and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    select c.tenant_id into v_client_tenant from public.clients c where c.id = new.client_id;
    if not found then
      raise exception 'That client does not exist.' using errcode = '23503';
    end if;
    if v_client_tenant is distinct from v_tenant then
      raise exception 'That client belongs to a different company.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Cleared on purpose, or nothing that decides the client changed: leave it.
    if new.client_id is distinct from old.client_id then
      return new;
    end if;
    if (name_col is null or (n -> name_col) is not distinct from (o -> name_col))
       and (n -> 'account_id') is not distinct from (o -> 'account_id') then
      return new;
    end if;
  end if;

  -- Payments: the client of the invoice they pay, when it has one.
  if tg_table_name = 'customer_payments' and coalesce(n ->> 'invoice_ref', '') <> '' then
    select i.client_id into v_from_invoice
    from public.invoices i
    where i.reference_number = n ->> 'invoice_ref' and i.tenant_id is not distinct from v_tenant
      and i.client_id is not null
    limit 1;
    if v_from_invoice is not null then
      new.client_id := v_from_invoice;
      return new;
    end if;
  end if;

  select * into v_match
  from public.rr_client_match(
    v_tenant,
    case when name_col is null then null else n ->> name_col end,
    case when email_col is null then null else n ->> email_col end,
    nullif(n ->> 'account_id', '')::uuid);
  new.client_id := v_match.client_id;
  return new;
end $$;

revoke all on function public.rr_client_link_stamp() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'tickets', 'website_inquiries'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists rr_client_link_stamp on public.%I', t);
    execute format(
      'create trigger rr_client_link_stamp before insert or update on public.%I
         for each row execute function public.rr_client_link_stamp()', t);
  end loop;
end $$;

------------------------------------------------------------
-- 4. A new or renamed client picks up its unlinked documents
------------------------------------------------------------
-- Only rows with no client_id, only in the same company, and only when this
-- client is the one and only match. Skipped for AI connector sessions (the AI
-- never changes sent quotes or invoices); those rows wait for the review list.
create or replace function public.rr_client_link_orphans()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_key text := public.rr_normalize_company_name(new.company_name);
  v_name text := lower(btrim(new.company_name));
  t text;
  name_col text;
begin
  if v_key = '' and v_name = '' then
    return null;
  end if;
  if to_regprocedure('public.rr_mcp_key_id()') is not null then
    if public.rr_mcp_key_id() is not null then
      return null;
    end if;
  end if;
  -- Another client has the same exact or normalized name: ambiguous, link nothing.
  if exists (
    select 1 from public.clients c
    where c.id <> new.id and c.tenant_id is not distinct from new.tenant_id
      and (lower(btrim(c.company_name)) = v_name or public.rr_normalize_company_name(c.company_name) = v_key)
  ) then
    return null;
  end if;
  foreach t in array array['quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'website_inquiries'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    name_col := case t when 'crm' then 'company_name' when 'website_inquiries' then 'company' else 'client' end;
    execute format(
      'update public.%1$I set client_id = $1
        where client_id is null and tenant_id is not distinct from $2
          and (lower(btrim(%2$I)) = $3 or (public.rr_normalize_company_name(%2$I) = $4 and $4 <> ''''))',
      t, name_col)
    using new.id, new.tenant_id, v_name, v_key;
  end loop;
  return null;
end $$;

revoke all on function public.rr_client_link_orphans() from public, anon, authenticated;

drop trigger if exists rr_client_link_orphans on public.clients;
create trigger rr_client_link_orphans after insert or update of company_name on public.clients
  for each row execute function public.rr_client_link_orphans();

------------------------------------------------------------
-- 5. Link log, existing-record linking, undo, manual link
------------------------------------------------------------
create table if not exists public.client_link_log (
  id bigserial primary key,
  tenant_id uuid references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  batch_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  client_id uuid not null,
  match text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists client_link_log_batch_idx on public.client_link_log (batch_id);

alter table public.client_link_log enable row level security;
revoke all on public.client_link_log from anon, authenticated;
grant select on public.client_link_log to authenticated;
drop policy if exists "Staff full access" on public.client_link_log;
drop policy if exists "Authenticated users full access" on public.client_link_log;
drop policy if exists "Managers read link log" on public.client_link_log;
create policy "Managers read link log" on public.client_link_log
  for select to authenticated using (public.rr_is_manager_or_admin());
drop policy if exists "Tenant isolation" on public.client_link_log;
create policy "Tenant isolation" on public.client_link_log as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id));

-- Every unlinked document with what it would match. p_apply links the
-- one-match rows and logs them as one batch (returned in batch_id).
-- kind: match | ambiguous | unmatched
create or replace function public.rr_link_clients(p_apply boolean default false)
returns table (
  kind text,
  table_name text,
  row_id uuid,
  row_label text,
  client_text text,
  match text,
  candidates integer,
  client_id uuid,
  client_name text,
  doc_date date,
  batch_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user boolean := auth.uid() is not null;
  v_tenant uuid := case when auth.uid() is not null then public.rr_my_tenant_id() else null end;
  v_batch uuid := case when p_apply then gen_random_uuid() else null end;
  v_who text := coalesce(public.rr_current_email(), 'system');
begin
  if v_user and not public.rr_is_manager_or_admin() then
    raise exception 'Only managers and admins can link documents to clients.' using errcode = '42501';
  end if;
  if v_user and to_regprocedure('public.rr_mcp_key_id()') is not null then
    if public.rr_mcp_key_id() is not null then
      raise exception 'The AI connector cannot link documents to clients.' using errcode = '42501';
    end if;
  end if;
  if p_apply and v_user and not public.rr_is_admin() then
    raise exception 'Only admins can link every matching document at once.' using errcode = '42501';
  end if;

  create temp table if not exists rr_client_link_rows (
    tenant_id uuid, table_name text, row_id uuid, row_label text, client_text text,
    email text, account_id uuid, invoice_ref text, doc_date date
  ) on commit drop;
  truncate rr_client_link_rows;

  insert into rr_client_link_rows
  select q.tenant_id, 'quotations', q.id,
         coalesce(nullif(q.reference_number, ''), nullif(q.quote_id, ''), 'Draft quote'),
         q.client, null, q.account_id, null, q.date
    from public.quotations q
   where q.client_id is null and q.deleted_at is null and btrim(q.client) <> ''
  union all
  select i.tenant_id, 'invoices', i.id, coalesce(nullif(i.reference_number, ''), 'Invoice'),
         i.client, null, i.account_id, null, i.date
    from public.invoices i
   where i.client_id is null and i.deleted_at is null and btrim(i.client) <> ''
  union all
  select d.tenant_id, 'delivery_notes', d.id, coalesce(nullif(d.reference_number, ''), 'Delivery note'),
         d.client, null, null, null, d.date
    from public.delivery_notes d
   where d.client_id is null and d.deleted_at is null and btrim(d.client) <> ''
  union all
  select p.tenant_id, 'customer_payments', p.id,
         'Payment ' || coalesce(nullif(p.invoice_ref, ''), nullif(p.quote_ref, ''), to_char(p.payment_date, 'YYYY-MM-DD')),
         p.client, null, null, nullif(p.invoice_ref, ''), p.payment_date
    from public.customer_payments p
   where p.client_id is null and p.deleted_at is null and btrim(p.client) <> ''
  union all
  select l.tenant_id, 'crm', l.id, 'Deal: ' || l.company_name, l.company_name,
         case when l.email_phone like '%@%' then l.email_phone end, l.account_id, null, l.created_at::date
    from public.crm l
   where l.client_id is null and l.deleted_at is null and btrim(l.company_name) <> ''
  union all
  select k.tenant_id, 'tickets', k.id, 'Ticket: ' || k.subject, '', k.requester_email, k.account_id, null, k.created_at::date
    from public.tickets k
   where k.client_id is null and k.deleted_at is null
     and (k.account_id is not null or k.requester_email like '%@%')
  union all
  select w.tenant_id, 'website_inquiries', w.id, 'Enquiry: ' || coalesce(nullif(w.company, ''), w.name),
         w.company, w.email, w.account_id, null, w.created_at::date
    from public.website_inquiries w
   where w.client_id is null and (btrim(coalesce(w.company, '')) <> '' or w.email like '%@%');

  if v_tenant is not null then
    delete from rr_client_link_rows r where r.tenant_id is distinct from v_tenant;
  end if;

  create temp table if not exists rr_client_link_result (
    tenant_id uuid, kind text, table_name text, row_id uuid, row_label text, client_text text,
    match text, candidates integer, client_id uuid, client_name text, doc_date date
  ) on commit drop;
  truncate rr_client_link_result;

  insert into rr_client_link_result
  select r.tenant_id,
         case when m.client_id is not null then 'match' when m.match = 'ambiguous' then 'ambiguous' else 'unmatched' end,
         r.table_name, r.row_id, r.row_label, r.client_text, m.match, m.candidates, m.client_id,
         c.company_name, r.doc_date
    from rr_client_link_rows r
    cross join lateral (
      select pm.client_id, pm.match, pm.candidates from (
        select i.client_id, 'invoice'::text as match, 1 as candidates
          from public.invoices i
         where r.invoice_ref is not null and i.reference_number = r.invoice_ref
           and i.tenant_id is not distinct from r.tenant_id and i.client_id is not null
         limit 1
      ) pm
      union all
      select x.client_id, x.match, x.candidates
        from public.rr_client_match(r.tenant_id, r.client_text, r.email, r.account_id) x
       where not exists (
         select 1 from public.invoices i
          where r.invoice_ref is not null and i.reference_number = r.invoice_ref
            and i.tenant_id is not distinct from r.tenant_id and i.client_id is not null)
    ) m
    left join public.clients c on c.id = m.client_id;

  if p_apply then
    insert into public.client_link_log (tenant_id, batch_id, table_name, row_id, client_id, match, created_by)
    select x.tenant_id, v_batch, x.table_name, x.row_id, x.client_id, x.match, v_who
      from rr_client_link_result x where x.kind = 'match';

    update public.quotations t set client_id = x.client_id from rr_client_link_result x
     where x.kind = 'match' and x.table_name = 'quotations' and t.id = x.row_id and t.client_id is null;
    update public.invoices t set client_id = x.client_id from rr_client_link_result x
     where x.kind = 'match' and x.table_name = 'invoices' and t.id = x.row_id and t.client_id is null;
    update public.delivery_notes t set client_id = x.client_id from rr_client_link_result x
     where x.kind = 'match' and x.table_name = 'delivery_notes' and t.id = x.row_id and t.client_id is null;
    update public.customer_payments t set client_id = x.client_id from rr_client_link_result x
     where x.kind = 'match' and x.table_name = 'customer_payments' and t.id = x.row_id and t.client_id is null;
    update public.crm t set client_id = x.client_id from rr_client_link_result x
     where x.kind = 'match' and x.table_name = 'crm' and t.id = x.row_id and t.client_id is null;
    update public.tickets t set client_id = x.client_id from rr_client_link_result x
     where x.kind = 'match' and x.table_name = 'tickets' and t.id = x.row_id and t.client_id is null;
    update public.website_inquiries t set client_id = x.client_id from rr_client_link_result x
     where x.kind = 'match' and x.table_name = 'website_inquiries' and t.id = x.row_id and t.client_id is null;
  end if;

  return query
    select x.kind, x.table_name, x.row_id, x.row_label, x.client_text, x.match, x.candidates,
           x.client_id, x.client_name, x.doc_date, v_batch
      from rr_client_link_result x
     order by array_position(array['ambiguous', 'unmatched', 'match'], x.kind),
              x.client_text, x.doc_date desc nulls last, x.row_label;
end $$;

-- Undo one rr_link_clients(true) run. Only rows still pointing at the client
-- that batch set are cleared.
create or replace function public.rr_unlink_clients(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n integer := 0;
  m integer;
  t text;
begin
  if auth.uid() is not null and not public.rr_is_admin() then
    raise exception 'Only admins can undo a client link batch.' using errcode = '42501';
  end if;
  foreach t in array array[
    'quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'tickets', 'website_inquiries'
  ] loop
    execute format(
      'update public.%I d set client_id = null from public.client_link_log l
        where l.batch_id = $1 and l.table_name = %L and d.id = l.row_id and d.client_id = l.client_id
          and ($2 or public.rr_same_tenant(l.tenant_id))',
      t, t)
    using p_batch_id, auth.uid() is null;
    get diagnostics m = row_count;
    n := n + m;
  end loop;
  delete from public.client_link_log l
   where l.batch_id = p_batch_id and (auth.uid() is null or public.rr_same_tenant(l.tenant_id));
  return n;
end $$;

-- A manager picks (or clears) the client of one document from the review list.
create or replace function public.rr_set_document_client(p_table text, p_row_id uuid, p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row_tenant uuid;
  n integer;
begin
  if not public.rr_is_manager_or_admin() then
    raise exception 'Only managers and admins can link documents to clients.' using errcode = '42501';
  end if;
  if to_regprocedure('public.rr_mcp_key_id()') is not null then
    if public.rr_mcp_key_id() is not null then
      raise exception 'The AI connector cannot link documents to clients.' using errcode = '42501';
    end if;
  end if;
  if p_table not in ('quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'tickets', 'website_inquiries') then
    raise exception 'Documents of type % cannot be linked to a client.', p_table using errcode = '22023';
  end if;
  execute format('select tenant_id from public.%I where id = $1', p_table) into v_row_tenant using p_row_id;
  if v_row_tenant is null or not public.rr_same_tenant(v_row_tenant) then
    raise exception 'That document is not visible to you.' using errcode = '42501';
  end if;
  -- The stamp trigger checks the client is in the same company.
  execute format('update public.%I set client_id = $1 where id = $2', p_table) using p_client_id, p_row_id;
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.rr_link_clients(boolean) from public, anon;
revoke all on function public.rr_unlink_clients(uuid) from public, anon;
revoke all on function public.rr_set_document_client(text, uuid, uuid) from public, anon;
grant execute on function public.rr_link_clients(boolean) to authenticated;
grant execute on function public.rr_unlink_clients(uuid) to authenticated;
grant execute on function public.rr_set_document_client(text, uuid, uuid) to authenticated;

------------------------------------------------------------
-- 6. Sales lock: a document linked to one of their clients is theirs
------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.rr_sales_client_ids()') is null then
    raise notice 'client links: Sales lock not installed, helpers unchanged';
    return;
  end if;

  execute $f$
  create or replace function public.rr_sales_quote_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = public, auth
  as $q$
    with k as (
      select public.rr_sales_client_keys() as keys, public.rr_sales_account_ids() as ids,
             public.rr_sales_client_ids() as clients, public.rr_current_email() as email
    )
    select coalesce(array_agg(q.id), '{}'::uuid[])
    from public.quotations q, k
    where lower(btrim(q.created_by)) = k.email
       or q.account_id = any (k.ids)
       or q.client_id = any (k.clients)
       or public.rr_normalize_company_name(q.client) = any (k.keys)
  $q$
  $f$;

  execute $f$
  create or replace function public.rr_sales_invoice_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = public, auth
  as $q$
    with k as (
      select public.rr_sales_client_keys() as keys, public.rr_sales_account_ids() as ids,
             public.rr_sales_client_ids() as clients, public.rr_current_email() as email,
             array(select q.reference_number from public.quotations q
                   where q.id = any (public.rr_sales_quote_ids()) and q.reference_number <> '') as refs
    )
    select coalesce(array_agg(i.id), '{}'::uuid[])
    from public.invoices i, k
    where lower(btrim(i.created_by)) = k.email
       or i.account_id = any (k.ids)
       or i.client_id = any (k.clients)
       or public.rr_normalize_company_name(i.client) = any (k.keys)
       or (i.reference_number <> '' and i.reference_number = any (k.refs))
  $q$
  $f$;

  execute $f$
  create or replace function public.rr_sales_doc_refs()
  returns text[]
  language sql
  stable
  security definer
  set search_path = public, auth
  as $q$
    with q as (
      select q.reference_number, q.quote_id, q.base_reference
      from public.quotations q
      where q.id = any (public.rr_sales_quote_ids())
    ),
    qrefs as (
      select reference_number as r from q
      union all select quote_id from q
      union all select base_reference from q
    ),
    qall as (
      select q2.reference_number as r from public.quotations q2
      where q2.base_reference <> '' and q2.base_reference in (select r from qrefs)
      union all
      select q2.quote_id from public.quotations q2
      where q2.base_reference <> '' and q2.base_reference in (select r from qrefs)
    ),
    irefs as (
      select i.reference_number as r from public.invoices i
      where i.id = any (public.rr_sales_invoice_ids())
    ),
    dn as (
      select d.reference_number as r from public.delivery_notes d
      where lower(btrim(d.created_by)) = public.rr_current_email()
         or d.client_id = any (public.rr_sales_client_ids())
         or public.rr_normalize_company_name(d.client) = any (public.rr_sales_client_keys())
         or d.quote_ref in (select r from qrefs union all select r from qall)
         or d.invoice_ref in (select r from irefs)
    )
    select coalesce(array_agg(distinct r) filter (where r <> ''), '{}'::text[])
    from (
      select r from qrefs union all select r from qall union all select r from irefs union all select r from dn
    ) s
  $q$
  $f$;

  revoke all on function public.rr_sales_quote_ids() from public;
  revoke all on function public.rr_sales_invoice_ids() from public;
  revoke all on function public.rr_sales_doc_refs() from public;
  grant execute on function public.rr_sales_quote_ids() to authenticated;
  grant execute on function public.rr_sales_invoice_ids() to authenticated;
  grant execute on function public.rr_sales_doc_refs() to authenticated;
end $$;

------------------------------------------------------------
-- 7. Link the existing records (one match only; the rest go to review)
------------------------------------------------------------
do $$
declare
  n integer;
begin
  select count(*) into n from public.rr_link_clients(true) r where r.kind = 'match';
  raise notice 'client links: % existing documents linked to their client', n;
end $$;

notify pgrst, 'reload schema';
