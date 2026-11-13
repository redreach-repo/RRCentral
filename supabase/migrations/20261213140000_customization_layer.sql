-- RRCRM M2 — customization foundation
--
-- Numbering sequences (move RR-/DN-/AC- counters into data),
-- custom field definitions/values, and saved list views.
-- Allocate refs via rr_allocate_reference() (atomic, tenant-scoped).

------------------------------------------------------------
-- Numbering sequences
------------------------------------------------------------
create table if not exists public.numbering_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  doc_type text not null
    check (doc_type in (
      'quotation', 'invoice', 'delivery_note', 'account', 'expense', 'other'
    )),
  division_code text not null default '01',
  prefix text not null default 'RR',
  year_yy text not null default to_char(now(), 'YY'),
  last_seq int not null default 0 check (last_seq >= 0),
  pad int not null default 3 check (pad between 2 and 6),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, doc_type, division_code, prefix, year_yy)
);

create index if not exists numbering_sequences_tenant_idx
  on public.numbering_sequences (tenant_id, doc_type);

------------------------------------------------------------
-- Custom fields
------------------------------------------------------------
create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  object_type text not null,
  field_key text not null,
  label text not null,
  field_type text not null default 'text'
    check (field_type in (
      'text', 'number', 'date', 'boolean', 'select', 'multiselect', 'url', 'email', 'phone'
    )),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, object_type, field_key)
);

create index if not exists custom_field_definitions_object_idx
  on public.custom_field_definitions (tenant_id, object_type);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  object_type text not null,
  record_id text not null,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, definition_id, record_id)
);

create index if not exists custom_field_values_record_idx
  on public.custom_field_values (tenant_id, object_type, record_id);

------------------------------------------------------------
-- Saved list views
------------------------------------------------------------
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  module_id text not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  sort jsonb not null default '[]'::jsonb,
  is_shared boolean not null default false,
  is_default boolean not null default false,
  owner_user_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_views_module_idx
  on public.saved_views (tenant_id, module_id);

------------------------------------------------------------
-- Seed sequences from existing refs (Red Reach tenant)
------------------------------------------------------------
do $$
declare
  tid uuid := 'a0000000-0000-4000-8000-000000000001';
  yy text := to_char(now(), 'YY');
  r record;
begin
  -- Quotations / invoices share RR-{div}-{YY}{seq} shape; seed both doc types
  -- from the higher of invoice + quotation max per division.
  for r in
    with refs as (
      select reference_number as ref from public.invoices
      where reference_number is not null
      union all
      select reference_number from public.quotations
      where reference_number is not null
    ),
    parsed as (
      select
        upper(substring(ref from '^([A-Za-z]+)-')) as prefix,
        substring(ref from '^[A-Za-z]+-([0-9]{2})-') as div,
        substring(ref from '^[A-Za-z]+-[0-9]{2}-([0-9]{2})') as year_part,
        substring(ref from '^[A-Za-z]+-[0-9]{2}-[0-9]{2}([0-9]+)') as seq_part
      from refs
      where ref ~ '^[A-Za-z]+-[0-9]{2}-[0-9]{2}[0-9]+'
    )
    select prefix, div, year_part, max(seq_part::int) as max_seq
    from parsed
    where prefix is not null and div is not null and year_part = yy
    group by prefix, div, year_part
  loop
    insert into public.numbering_sequences (
      tenant_id, doc_type, division_code, prefix, year_yy, last_seq
    ) values
      (tid, 'quotation', r.div, r.prefix, r.year_part, r.max_seq),
      (tid, 'invoice', r.div, r.prefix, r.year_part, r.max_seq)
    on conflict (tenant_id, doc_type, division_code, prefix, year_yy)
    do update set last_seq = greatest(public.numbering_sequences.last_seq, excluded.last_seq),
                  updated_at = now();
  end loop;

  -- Delivery notes
  for r in
    with parsed as (
      select
        upper(substring(reference_number from '^([A-Za-z]+)-')) as prefix,
        substring(reference_number from '^[A-Za-z]+-([0-9]{2})-') as div,
        substring(reference_number from '^[A-Za-z]+-[0-9]{2}-([0-9]{2})') as year_part,
        substring(reference_number from '^[A-Za-z]+-[0-9]{2}-[0-9]{2}([0-9]+)') as seq_part
      from public.delivery_notes
      where reference_number ~ '^[A-Za-z]+-[0-9]{2}-[0-9]{2}[0-9]+'
    )
    select prefix, div, year_part, max(seq_part::int) as max_seq
    from parsed
    where year_part = yy
    group by prefix, div, year_part
  loop
    insert into public.numbering_sequences (
      tenant_id, doc_type, division_code, prefix, year_yy, last_seq
    ) values (tid, 'delivery_note', r.div, coalesce(nullif(r.prefix, ''), 'DN'), r.year_part, r.max_seq)
    on conflict (tenant_id, doc_type, division_code, prefix, year_yy)
    do update set last_seq = greatest(public.numbering_sequences.last_seq, excluded.last_seq),
                  updated_at = now();
  end loop;

  -- Accounts AC-{code}-{YY}{seq}
  for r in
    with parsed as (
      select
        substring(reference from '^AC-([0-9]{2})-') as div,
        substring(reference from '^AC-[0-9]{2}-([0-9]{2})') as year_part,
        substring(reference from '^AC-[0-9]{2}-[0-9]{2}([0-9]+)') as seq_part
      from public.accounts
      where reference ~ '^AC-[0-9]{2}-[0-9]{2}[0-9]+'
    )
    select div, year_part, max(seq_part::int) as max_seq
    from parsed
    where year_part = yy
    group by div, year_part
  loop
    insert into public.numbering_sequences (
      tenant_id, doc_type, division_code, prefix, year_yy, last_seq
    ) values (tid, 'account', r.div, 'AC', r.year_part, r.max_seq)
    on conflict (tenant_id, doc_type, division_code, prefix, year_yy)
    do update set last_seq = greatest(public.numbering_sequences.last_seq, excluded.last_seq),
                  updated_at = now();
  end loop;

  -- Defaults for common divisions if nothing existed yet
  insert into public.numbering_sequences (tenant_id, doc_type, division_code, prefix, year_yy, last_seq)
  select tid, d.doc_type, d.div, d.prefix, yy, 0
  from (values
    ('quotation', '01', 'RR'),
    ('quotation', '02', 'RR'),
    ('quotation', '03', 'RR'),
    ('quotation', '04', 'RR'),
    ('invoice', '01', 'RR'),
    ('invoice', '02', 'RR'),
    ('invoice', '03', 'RR'),
    ('invoice', '04', 'RR'),
    ('delivery_note', '01', 'DN'),
    ('account', '01', 'AC'),
    ('account', '07', 'AC'),
    ('account', '08', 'AC'),
    ('account', '09', 'AC')
  ) as d(doc_type, div, prefix)
  on conflict (tenant_id, doc_type, division_code, prefix, year_yy) do nothing;
end $$;

------------------------------------------------------------
-- Atomic allocate
------------------------------------------------------------
create or replace function public.rr_allocate_reference(
  p_doc_type text,
  p_division_code text default '01',
  p_prefix text default null
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  tid uuid := public.rr_my_tenant_id();
  div text := lpad(coalesce(nullif(trim(p_division_code), ''), '01'), 2, '0');
  pref text;
  yy text := to_char(now(), 'YY');
  seq int;
  pad_n int;
  out_ref text;
  -- Quotations and invoices share RR-{div}-{YY}{seq}; drive from 'quotation' and mirror.
  drive_type text;
begin
  if tid is null then
    raise exception 'not authenticated for tenant';
  end if;
  if p_doc_type not in ('quotation', 'invoice', 'delivery_note', 'account', 'expense', 'other') then
    raise exception 'invalid doc_type %', p_doc_type;
  end if;

  pref := upper(coalesce(
    nullif(trim(p_prefix), ''),
    case p_doc_type
      when 'delivery_note' then 'DN'
      when 'account' then 'AC'
      else 'RR'
    end
  ));

  drive_type := case
    when p_doc_type in ('quotation', 'invoice') then 'quotation'
    else p_doc_type
  end;

  insert into public.numbering_sequences (
    tenant_id, doc_type, division_code, prefix, year_yy, last_seq
  ) values (tid, drive_type, div, pref, yy, 0)
  on conflict (tenant_id, doc_type, division_code, prefix, year_yy) do nothing;

  if drive_type = 'quotation' then
    insert into public.numbering_sequences (
      tenant_id, doc_type, division_code, prefix, year_yy, last_seq
    ) values (tid, 'invoice', div, pref, yy, 0)
    on conflict (tenant_id, doc_type, division_code, prefix, year_yy) do nothing;
  end if;

  update public.numbering_sequences
  set last_seq = last_seq + 1,
      updated_at = now()
  where tenant_id = tid
    and doc_type = drive_type
    and division_code = div
    and prefix = pref
    and year_yy = yy
  returning last_seq, pad into seq, pad_n;

  if seq is null then
    raise exception 'failed to allocate reference';
  end if;

  if drive_type = 'quotation' then
    update public.numbering_sequences
    set last_seq = seq,
        updated_at = now()
    where tenant_id = tid
      and doc_type = 'invoice'
      and division_code = div
      and prefix = pref
      and year_yy = yy;
  end if;

  out_ref := pref || '-' || div || '-' || yy || lpad(seq::text, pad_n, '0');
  return out_ref;
end;
$$;

revoke all on function public.rr_allocate_reference(text, text, text) from public;
grant execute on function public.rr_allocate_reference(text, text, text) to authenticated;

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.numbering_sequences enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.saved_views enable row level security;

drop policy if exists "Members read numbering" on public.numbering_sequences;
create policy "Members read numbering" on public.numbering_sequences
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write numbering" on public.numbering_sequences;
create policy "Admins write numbering" on public.numbering_sequences
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Members read custom fields" on public.custom_field_definitions;
create policy "Members read custom fields" on public.custom_field_definitions
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write custom fields" on public.custom_field_definitions;
create policy "Admins write custom fields" on public.custom_field_definitions
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Staff read custom values" on public.custom_field_values;
create policy "Staff read custom values" on public.custom_field_values
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write custom values" on public.custom_field_values;
create policy "Staff write custom values" on public.custom_field_values
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Members read saved views" on public.saved_views;
create policy "Members read saved views" on public.saved_views
  for select to authenticated
  using (
    tenant_id = public.rr_my_tenant_id()
    and public.rr_is_staff()
    and (is_shared or owner_user_id = (
      select au.id from public.app_users au
      where lower(au.email) = public.rr_current_email() and au.active
      limit 1
    ))
  );

drop policy if exists "Members write own saved views" on public.saved_views;
create policy "Members write own saved views" on public.saved_views
  for all to authenticated
  using (
    tenant_id = public.rr_my_tenant_id()
    and public.rr_is_staff()
    and (
      public.rr_is_admin()
      or owner_user_id = (
        select au.id from public.app_users au
        where lower(au.email) = public.rr_current_email() and au.active
        limit 1
      )
    )
  )
  with check (
    tenant_id = public.rr_my_tenant_id()
    and public.rr_is_staff()
  );

-- Restrictive tenant isolation (same pattern as M1)
do $$
declare
  t text;
begin
  foreach t in array array[
    'numbering_sequences',
    'custom_field_definitions',
    'custom_field_values',
    'saved_views'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t
    );
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
  end loop;
end $$;

comment on table public.numbering_sequences is 'RRCRM M2: per-tenant document numbering counters.';
comment on table public.custom_field_definitions is 'RRCRM M2: tenant-defined fields on CRM objects.';
comment on table public.custom_field_values is 'RRCRM M2: values for custom field definitions.';
comment on table public.saved_views is 'RRCRM M2: saved list filters/columns per module.';
comment on function public.rr_allocate_reference(text, text, text) is
  'RRCRM M2: atomically allocate next PREFIX-DIV-YYseq reference for the caller tenant.';
