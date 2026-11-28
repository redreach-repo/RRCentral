-- Merge duplicate client records (HighMast brief fix 4, part 1; Alfred 2026-11-28).
--
-- An admin picks the client to keep and one or more duplicates, sees a preview
-- of every linked record that will move (with counts) and every field where
-- they differ, picks the value to keep per field, types MERGE and merges in
-- one transaction. Then:
--   * every quote, invoice, delivery note, payment, deal, ticket, website
--     enquiry, client PO and uniform staff row of a duplicate points at the
--     client kept; optionally, unlinked documents typed with one of the merged
--     names (same company key) are linked too;
--   * contacts are combined, without repeating an email or phone;
--   * each duplicate is soft deleted with merged_into set (its old page opens
--     the client kept);
--   * client_merges records who merged what, with everything needed to undo;
--   * quote and invoice numbers, typed client names, totals and PDFs are never
--     changed.
-- Undo (rr_client_merge_undo) puts every moved row back on its old client,
-- restores the duplicates and the kept client's fields. Rows added to the kept
-- client after the merge stay where they are.
--
-- Access: admins only, people only (the AI connector can never merge or undo;
-- it may only propose a merge for a person to confirm, in a later change).
-- Tenant scoped: only clients of the admin's own company.
--
-- Also: rr_company_key() (names compare without case, punctuation, LLC, L.L.C,
-- SP, FZE, FZCO, Company, Co, Est...; "Ready Mix" = "ReadyMix" = "Readymix"),
-- and merged or deleted clients are never matched when documents are linked.
--
-- Needs 20261339090000_client_links.sql. Safe to re-run.
--
-- To reverse (after undoing any merges you want back):
--   drop function if exists public.rr_client_merge_undo(uuid, text);
--   drop function if exists public.rr_client_merge_guard(uuid, uuid[]);
--   drop function if exists public.rr_client_merge_fields();
--   drop function if exists public.rr_client_merge(uuid, uuid[], jsonb, boolean, text);
--   drop function if exists public.rr_client_merge_preview(uuid, uuid[]);
--   drop table if exists public.client_merges;
--   alter table public.clients drop column if exists merged_into, drop column if exists merged_at,
--     drop column if exists deleted_at;
--   drop function if exists public.rr_company_key(text);
--   and re-run 20261339090000_client_links.sql sections 2 and 4.

do $$
begin
  if to_regprocedure('public.rr_client_match(uuid, text, text, uuid)') is null then
    raise exception 'Run 20261339090000_client_links.sql first (client links are missing).';
  end if;
end $$;

------------------------------------------------------------
-- 1. Company key, merged/deleted columns on clients
------------------------------------------------------------
create or replace function public.rr_company_key(raw text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(raw, '')), '&', ' and ', 'g'),
          '[^a-z0-9]+', ' ', 'g'),
        '\m(l l c|l l c s p|s p c|s p)\M', ' ', 'g'),
      '\mready ?mix\M', 'readymix', 'g'),
    '\m(the|llc|llcsp|spc|sp|fze|fzco|fz|fzc|fze llc|co|company|ltd|limited|est|establishment|trading|inc|plc|llp|dmcc|group)\M|\s+', ' ', 'g'))
$$;

comment on function public.rr_company_key(text) is
  'Company name for duplicate checks: lower case, no punctuation or company suffixes (LLC, L.L.C, SP, FZE, FZCO, Company, Co, Est ...), Ready Mix = ReadyMix.';

alter table public.clients add column if not exists merged_into uuid references public.clients (id) on delete set null;
alter table public.clients add column if not exists merged_at timestamptz;
alter table public.clients add column if not exists deleted_at timestamptz;
create index if not exists clients_merged_into_idx on public.clients (merged_into) where merged_into is not null;

------------------------------------------------------------
-- 2. Merged or deleted clients are never matched when linking
------------------------------------------------------------
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
    where c.account_id = p_account and c.tenant_id is not distinct from p_tenant
      and c.merged_into is null and c.deleted_at is null;
    if cardinality(ids) = 1 then
      return query select ids[1], 'account'::text, 1;
      return;
    end if;
  end if;

  if v_name <> '' then
    select coalesce(array_agg(c.id), '{}') into ids
    from public.clients c
    where lower(btrim(c.company_name)) = v_name and c.tenant_id is not distinct from p_tenant
      and c.merged_into is null and c.deleted_at is null;
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
    where public.rr_normalize_company_name(c.company_name) = v_key and c.tenant_id is not distinct from p_tenant
      and c.merged_into is null and c.deleted_at is null;
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
      and c.merged_into is null and c.deleted_at is null
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
  if (v_key = '' and v_name = '') or new.merged_into is not null or new.deleted_at is not null then
    return null;
  end if;
  if to_regprocedure('public.rr_mcp_key_id()') is not null then
    if public.rr_mcp_key_id() is not null then
      return null;
    end if;
  end if;
  if exists (
    select 1 from public.clients c
    where c.id <> new.id and c.tenant_id is not distinct from new.tenant_id
      and c.merged_into is null and c.deleted_at is null
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

------------------------------------------------------------
-- 3. Merge log (the audit entry, and what undo needs)
------------------------------------------------------------
create table if not exists public.client_merges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  survivor_id uuid not null references public.clients (id) on delete cascade,
  duplicate_ids uuid[] not null,
  -- field -> client id the value was taken from
  field_choices jsonb not null default '{}'::jsonb,
  survivor_before jsonb not null,
  duplicates_before jsonb not null,
  -- [{table, row_id, from}] every row whose client_id was changed
  moved jsonb not null default '[]'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  reason text not null default '' check (length(reason) <= 1000),
  merged_by uuid references public.app_users (id) on delete set null,
  merged_by_email text not null default '',
  merged_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by_email text not null default '',
  undo_reason text not null default ''
);
create index if not exists client_merges_tenant_idx on public.client_merges (tenant_id, merged_at desc);
create index if not exists client_merges_survivor_idx on public.client_merges (survivor_id);

comment on table public.client_merges is
  'Every client merge: who, when, which records, the values before and every moved row, so it can be undone.';

alter table public.client_merges enable row level security;
revoke all on public.client_merges from anon, authenticated;
grant select on public.client_merges to authenticated;
drop policy if exists "Staff full access" on public.client_merges;
drop policy if exists "Authenticated users full access" on public.client_merges;
drop policy if exists "Viewers read" on public.client_merges;
drop policy if exists "Admins read merges" on public.client_merges;
create policy "Admins read merges" on public.client_merges
  for select to authenticated using (public.rr_is_admin());
drop policy if exists "Tenant isolation" on public.client_merges;
create policy "Tenant isolation" on public.client_merges as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id));

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rr_audit_trigger') then
    drop trigger if exists rr_audit on public.client_merges;
    create trigger rr_audit after insert or update or delete on public.client_merges
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

------------------------------------------------------------
-- 4. Who may merge: an admin, a person, inside their company
------------------------------------------------------------
create or replace function public.rr_client_merge_guard(p_survivor uuid, p_duplicates uuid[])
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
  n integer;
begin
  if auth.uid() is null or not public.rr_is_admin() then
    raise exception 'Only admins can merge clients.' using errcode = '42501';
  end if;
  if to_regprocedure('public.rr_mcp_key_id()') is not null then
    if public.rr_mcp_key_id() is not null then
      raise exception 'The AI connector cannot merge clients. A person confirms every merge in HighMast.' using errcode = '42501';
    end if;
  end if;
  if p_survivor is null or coalesce(cardinality(p_duplicates), 0) = 0 then
    raise exception 'Pick the client to keep and at least one duplicate.' using errcode = '22023';
  end if;
  if p_survivor = any (p_duplicates) then
    raise exception 'The client to keep cannot also be a duplicate.' using errcode = '22023';
  end if;
  if cardinality(p_duplicates) > 20 then
    raise exception 'Merge at most 20 duplicates at a time.' using errcode = '22023';
  end if;
  v_tenant := public.rr_my_tenant_id();
  select count(*) into n
  from public.clients c
  where c.id = any (array_append(p_duplicates, p_survivor))
    and c.tenant_id is not distinct from v_tenant
    and c.merged_into is null and c.deleted_at is null;
  if n <> cardinality(p_duplicates) + 1 then
    raise exception 'One of these clients is not visible to you, is in another company, or was already merged.' using errcode = '42501';
  end if;
  return v_tenant;
end $$;

revoke all on function public.rr_client_merge_guard(uuid, uuid[]) from public, anon, authenticated;

-- The fields a merge can take from any of the records.
create or replace function public.rr_client_merge_fields()
returns text[]
language sql
immutable
as $$
  select array['company_name', 'short_name', 'trn', 'address', 'primary_contact', 'email', 'mobile',
               'office', 'website', 'company_owner', 'notes', 'account_id', 'drive_folder_url']
$$;

------------------------------------------------------------
-- 5. Preview: what moves, where the records differ
------------------------------------------------------------
create or replace function public.rr_client_merge_preview(p_survivor uuid, p_duplicates uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid := public.rr_client_merge_guard(p_survivor, p_duplicates);
  v_ids uuid[] := array_append(p_duplicates, p_survivor);
  v_keys text[];
  v_moves jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_unlinked jsonb := '{}'::jsonb;
  v_fields jsonb := '[]'::jsonb;
  v_records jsonb;
  v_contacts jsonb;
  f text;
  t text;
  name_col text;
  n integer;
  vals jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'company_name', c.company_name, 'short_name', c.short_name, 'trn', c.trn,
           'address', c.address, 'primary_contact', c.primary_contact, 'email', c.email, 'mobile', c.mobile,
           'office', c.office, 'website', c.website, 'company_owner', c.company_owner, 'notes', c.notes,
           'account_id', c.account_id, 'drive_folder_url', c.drive_folder_url, 'created_at', c.created_at,
           'account_reference', a.reference, 'account_name', a.name,
           'keep', c.id = p_survivor)
           order by (c.id = p_survivor) desc, c.created_at), '[]'::jsonb)
    into v_records
  from public.clients c left join public.accounts a on a.id = c.account_id
  where c.id = any (v_ids);

  -- Linked rows of the duplicates (these move to the client kept).
  foreach t in array array['quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'tickets',
                           'website_inquiries', 'client_purchase_orders', 'client_uniform_staff'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('select count(*) from public.%I where client_id = any ($1)', t) into n using p_duplicates;
    if n > 0 then
      v_moves := v_moves || jsonb_build_object(t, n);
    end if;
  end loop;

  -- Unlinked documents typed with one of the merged names (optional on merge).
  select array_agg(distinct public.rr_company_key(c.company_name)) filter (where public.rr_company_key(c.company_name) <> '')
    into v_keys
  from public.clients c where c.id = any (v_ids);
  foreach t in array array['quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'website_inquiries'] loop
    if to_regclass('public.' || t) is null or v_keys is null then
      continue;
    end if;
    name_col := case t when 'crm' then 'company_name' when 'website_inquiries' then 'company' else 'client' end;
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''label'', %2$s, ''typed'', %3$I)), ''[]''::jsonb)
         from public.%1$I
        where client_id is null and tenant_id is not distinct from $2
          and public.rr_company_key(%3$I) = any ($1)',
      t,
      case t
        when 'quotations' then 'coalesce(nullif(reference_number, ''''), nullif(quote_id, ''''), ''Draft quote'')'
        when 'invoices' then 'coalesce(nullif(reference_number, ''''), ''Invoice'')'
        when 'delivery_notes' then 'coalesce(nullif(reference_number, ''''), ''Delivery note'')'
        when 'customer_payments' then '''Payment '' || coalesce(nullif(invoice_ref, ''''), nullif(quote_ref, ''''), '''')'
        when 'crm' then '''Deal: '' || company_name'
        else '''Enquiry: '' || coalesce(nullif(company, ''''), name)'
      end,
      name_col)
    into v_rows using v_keys, v_tenant;
    if jsonb_array_length(v_rows) > 0 then
      v_unlinked := v_unlinked || jsonb_build_object(t, v_rows);
    end if;
  end loop;

  -- Fields where the records differ (blank values left out).
  foreach f in array public.rr_client_merge_fields() loop
    select jsonb_agg(jsonb_build_object('client_id', r ->> 'id', 'value', r -> f) order by (r ->> 'keep')::boolean desc)
      into vals
    from jsonb_array_elements(v_records) r
    where coalesce(nullif(btrim(r ->> f), ''), null) is not null;
    if vals is not null and (select count(distinct lower(btrim(v ->> 'value'))) from jsonb_array_elements(vals) v) > 1 then
      v_fields := v_fields || jsonb_build_array(jsonb_build_object('field', f, 'values', vals));
    end if;
  end loop;

  -- Contacts after the merge (combined, no repeated email or phone).
  select coalesce(jsonb_agg(x.e order by x.ord), '[]'::jsonb) into v_contacts
  from (
    select distinct on (coalesce(nullif(lower(btrim(e ->> 'email')), ''), nullif(regexp_replace(coalesce(e ->> 'phone', e ->> 'mobile', ''), '\D', '', 'g'), ''), lower(btrim(e ->> 'name'))))
           e, ord
    from (
      select e, row_number() over () + case when c.id = p_survivor then 0 else 100000 end as ord
      from public.clients c,
           jsonb_array_elements(case when jsonb_typeof(c.contacts) = 'array' then c.contacts else '[]'::jsonb end) e
      where c.id = any (v_ids)
    ) s
    where coalesce(nullif(btrim(e ->> 'email'), ''), nullif(btrim(coalesce(e ->> 'phone', e ->> 'mobile')), ''), nullif(btrim(e ->> 'name'), '')) is not null
    order by coalesce(nullif(lower(btrim(e ->> 'email')), ''), nullif(regexp_replace(coalesce(e ->> 'phone', e ->> 'mobile', ''), '\D', '', 'g'), ''), lower(btrim(e ->> 'name'))), ord
  ) x;

  return jsonb_build_object(
    'survivor_id', p_survivor,
    'duplicate_ids', to_jsonb(p_duplicates),
    'records', v_records,
    'moves', v_moves,
    'unlinked', v_unlinked,
    'fields', v_fields,
    'contacts', v_contacts);
end $$;


------------------------------------------------------------
-- 6. Merge (one transaction)
------------------------------------------------------------
-- p_fields: {"field": "<client id to take the value from>"}; fields left out
-- keep the kept client's value, or fill a blank from the oldest duplicate that
-- has one. p_confirm must be MERGE.
create or replace function public.rr_client_merge(
  p_survivor uuid,
  p_duplicates uuid[],
  p_fields jsonb default '{}'::jsonb,
  p_link_unlinked boolean default true,
  p_confirm text default '',
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
  v_ids uuid[] := array_append(p_duplicates, p_survivor);
  v_merge uuid := gen_random_uuid();
  v_before jsonb;
  v_dups jsonb;
  v_survivor jsonb;
  v_preview jsonb;
  v_moved jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_choices jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_src uuid;
  v_val jsonb;
  f text;
  t text;
begin
  v_tenant := public.rr_client_merge_guard(p_survivor, p_duplicates);
  if upper(btrim(coalesce(p_confirm, ''))) <> 'MERGE' then
    raise exception 'Type MERGE to confirm. Nothing was changed.' using errcode = '22023';
  end if;
  if p_fields is not null and jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Field picks must be an object of field -> client id.' using errcode = '22023';
  end if;

  -- Lock all records first so nobody edits them half way.
  perform 1 from public.clients c where c.id = any (v_ids) order by c.id for update;
  v_preview := public.rr_client_merge_preview(p_survivor, p_duplicates);

  select to_jsonb(c) into v_before from public.clients c where c.id = p_survivor;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) into v_dups
    from public.clients c where c.id = any (p_duplicates);
  v_survivor := v_before;

  -- Field values: picked ones, else keep, else fill a blank from a duplicate.
  foreach f in array public.rr_client_merge_fields() loop
    v_src := nullif(coalesce(p_fields, '{}'::jsonb) ->> f, '')::uuid;
    if v_src is not null then
      if not (v_src = any (v_ids)) then
        raise exception 'The value for % must come from one of the clients being merged.', f using errcode = '22023';
      end if;
      select to_jsonb(c) -> f into v_val from public.clients c where c.id = v_src;
      v_survivor := jsonb_set(v_survivor, array[f], coalesce(v_val, 'null'::jsonb));
      if v_src <> p_survivor then
        v_choices := v_choices || jsonb_build_object(f, v_src);
      end if;
    elsif nullif(btrim(coalesce(v_survivor ->> f, '')), '') is null then
      v_val := null;
      select d -> f, (d ->> 'id')::uuid into v_val, v_src
      from jsonb_array_elements(v_dups) d
      where nullif(btrim(coalesce(d ->> f, '')), '') is not null
      limit 1;
      if v_val is not null then
        v_survivor := jsonb_set(v_survivor, array[f], v_val);
        v_choices := v_choices || jsonb_build_object(f, v_src);
      end if;
    end if;
  end loop;

  -- The duplicates leave first; the client kept may take over their account.
  update public.clients c
     set merged_into = p_survivor, merged_at = now(), deleted_at = now(),
         account_id = case when c.account_id::text = (v_survivor ->> 'account_id') then null else c.account_id end
   where c.id = any (p_duplicates);

  update public.clients c
     set company_name = coalesce(v_survivor ->> 'company_name', c.company_name),
         short_name = coalesce(v_survivor ->> 'short_name', ''),
         trn = coalesce(v_survivor ->> 'trn', ''),
         address = coalesce(v_survivor ->> 'address', ''),
         primary_contact = coalesce(v_survivor ->> 'primary_contact', ''),
         email = coalesce(v_survivor ->> 'email', ''),
         mobile = coalesce(v_survivor ->> 'mobile', ''),
         office = coalesce(v_survivor ->> 'office', ''),
         website = coalesce(v_survivor ->> 'website', ''),
         company_owner = coalesce(v_survivor ->> 'company_owner', ''),
         notes = coalesce(v_survivor ->> 'notes', ''),
         account_id = nullif(v_survivor ->> 'account_id', '')::uuid,
         drive_folder_url = coalesce(v_survivor ->> 'drive_folder_url', ''),
         contacts = coalesce(v_preview -> 'contacts', '[]'::jsonb)
   where c.id = p_survivor;

  -- Every linked row of a duplicate moves to the client kept (old client logged).
  foreach t in array array['quotations', 'invoices', 'delivery_notes', 'customer_payments', 'crm', 'tickets',
                           'website_inquiries', 'client_purchase_orders', 'client_uniform_staff'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format(
      'with old as (select d.id, d.client_id from public.%1$I d where d.client_id = any ($2) for update),
            m as (update public.%1$I d set client_id = $1 from old where d.id = old.id
                  returning d.id, old.client_id as from_id)
       select coalesce(jsonb_agg(jsonb_build_object(''table'', $3, ''row_id'', m.id, ''from'', m.from_id)), ''[]''::jsonb) from m',
      t)
      into v_rows using p_survivor, p_duplicates, t;
    if jsonb_array_length(v_rows) > 0 then
      v_moved := v_moved || v_rows;
      v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
    end if;
  end loop;

  -- Unlinked documents typed with one of the merged names.
  if p_link_unlinked then
    for t in select key from jsonb_each(coalesce(v_preview -> 'unlinked', '{}'::jsonb)) loop
      execute format(
        'with m as (update public.%I d set client_id = $1
                     where d.client_id is null and d.id = any ($2) returning d.id)
         select coalesce(jsonb_agg(jsonb_build_object(''table'', $3, ''row_id'', m.id, ''from'', null)), ''[]''::jsonb) from m', t)
        into v_rows
        using p_survivor, array(select (x ->> 'id')::uuid from jsonb_array_elements(v_preview -> 'unlinked' -> t) x), t;
      if jsonb_array_length(v_rows) > 0 then
        v_moved := v_moved || v_rows;
        v_counts := v_counts || jsonb_build_object('unlinked_' || t, jsonb_array_length(v_rows));
      end if;
    end loop;
  end if;

  insert into public.client_merges (id, tenant_id, survivor_id, duplicate_ids, field_choices, survivor_before,
                                    duplicates_before, moved, counts, reason, merged_by, merged_by_email)
  values (v_merge, v_tenant, p_survivor, p_duplicates, v_choices, v_before, v_dups, v_moved, v_counts,
          left(coalesce(p_reason, ''), 1000), public.rr_current_user_id(), coalesce(public.rr_current_email(), ''));

  return jsonb_build_object('merge_id', v_merge, 'survivor_id', p_survivor, 'counts', v_counts);
end $$;

------------------------------------------------------------
-- 7. Undo
------------------------------------------------------------
create or replace function public.rr_client_merge_undo(p_merge_id uuid, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  m public.client_merges%rowtype;
  v_moved jsonb;
  t text;
  n integer := 0;
  k integer;
  b jsonb;
begin
  if auth.uid() is null or not public.rr_is_admin() then
    raise exception 'Only admins can undo a merge.' using errcode = '42501';
  end if;
  if to_regprocedure('public.rr_mcp_key_id()') is not null then
    if public.rr_mcp_key_id() is not null then
      raise exception 'The AI connector cannot undo merges.' using errcode = '42501';
    end if;
  end if;
  select * into m from public.client_merges where id = p_merge_id for update;
  if not found or not public.rr_same_tenant(m.tenant_id) then
    raise exception 'Merge not found.' using errcode = 'P0002';
  end if;
  if m.undone_at is not null then
    raise exception 'This merge was already undone.' using errcode = '22023';
  end if;
  if exists (select 1 from public.client_merges x
              where x.tenant_id = m.tenant_id and x.undone_at is null and x.merged_at > m.merged_at and x.id <> m.id
                and (x.survivor_id = any (m.duplicate_ids || m.survivor_id)
                     or x.duplicate_ids && (m.duplicate_ids || m.survivor_id))) then
    raise exception 'A later merge involves these clients. Undo that one first.' using errcode = '22023';
  end if;

  -- Duplicates come back first (with their account), then the kept client's fields.
  for b in select * from jsonb_array_elements(m.duplicates_before) loop
    update public.clients c
       set merged_into = null, merged_at = null, deleted_at = nullif(b ->> 'deleted_at', '')::timestamptz,
           account_id = nullif(b ->> 'account_id', '')::uuid
     where c.id = (b ->> 'id')::uuid and c.merged_into = m.survivor_id;
  end loop;
  b := m.survivor_before;
  update public.clients c
     set company_name = coalesce(b ->> 'company_name', c.company_name),
         short_name = coalesce(b ->> 'short_name', ''),
         trn = coalesce(b ->> 'trn', ''),
         address = coalesce(b ->> 'address', ''),
         primary_contact = coalesce(b ->> 'primary_contact', ''),
         email = coalesce(b ->> 'email', ''),
         mobile = coalesce(b ->> 'mobile', ''),
         office = coalesce(b ->> 'office', ''),
         website = coalesce(b ->> 'website', ''),
         company_owner = coalesce(b ->> 'company_owner', ''),
         notes = coalesce(b ->> 'notes', ''),
         account_id = nullif(b ->> 'account_id', '')::uuid,
         drive_folder_url = coalesce(b ->> 'drive_folder_url', ''),
         contacts = coalesce(b -> 'contacts', '[]'::jsonb)
   where c.id = m.survivor_id;

  -- Moved rows go back, only if they are still on the client kept.
  for t in select distinct x ->> 'table' from jsonb_array_elements(m.moved) x loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    select jsonb_agg(x) into v_moved from jsonb_array_elements(m.moved) x where x ->> 'table' = t;
    execute format(
      'with back as (select (x ->> ''row_id'')::uuid as row_id, nullif(x ->> ''from'', '''')::uuid as from_id
                       from jsonb_array_elements($1) x)
       update public.%I d set client_id = back.from_id from back
        where d.id = back.row_id and d.client_id = $2', t)
      using v_moved, m.survivor_id;
    get diagnostics k = row_count;
    n := n + k;
  end loop;

  update public.client_merges
     set undone_at = now(), undone_by_email = coalesce(public.rr_current_email(), ''),
         undo_reason = left(coalesce(p_reason, ''), 1000)
   where id = m.id;

  return jsonb_build_object('merge_id', m.id, 'restored_clients', cardinality(m.duplicate_ids), 'rows_moved_back', n);
end $$;

revoke all on function public.rr_client_merge_guard(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.rr_client_merge_preview(uuid, uuid[]) from public, anon;
revoke all on function public.rr_client_merge(uuid, uuid[], jsonb, boolean, text, text) from public, anon;
revoke all on function public.rr_client_merge_undo(uuid, text) from public, anon;
grant execute on function public.rr_client_merge_preview(uuid, uuid[]) to authenticated;
grant execute on function public.rr_client_merge(uuid, uuid[], jsonb, boolean, text, text) to authenticated;
grant execute on function public.rr_client_merge_undo(uuid, text) to authenticated;
grant execute on function public.rr_company_key(text) to authenticated;
