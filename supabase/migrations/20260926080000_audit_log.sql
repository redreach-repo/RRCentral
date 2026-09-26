-- RED REACH Central — audit trail
--
-- Records who created, changed or deleted key records, with before/after
-- values. Written by database triggers, so it also captures changes made
-- outside the app (SQL editor, scripts). Clients can never write to it;
-- admins can read it (policy lives in the security migration).
-- Safe to re-run.

create table if not exists audit_log (
  id bigserial primary key,
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_id text not null default '',
  actor_email text not null default '',
  changed_fields text[] not null default '{}',
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created on audit_log (created_at desc);
create index if not exists idx_audit_log_table_row on audit_log (table_name, row_id);
create index if not exists idx_audit_log_actor on audit_log (actor_email);

alter table audit_log enable row level security;
revoke all on audit_log from anon;
revoke insert, update, delete on audit_log from authenticated;

create or replace function public.rr_audit_redact(tbl text, data jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when data is null then null
    when tbl = 'app_settings'
      and (data->>'key' ilike '%secret%' or data->>'key' ilike '%token%'
           or data->>'key' ilike '%password%' or data->>'key' ilike '%apikey%')
      then jsonb_set(data, '{value}', '"[redacted]"')
    else data
  end
$$;

create or replace function public.rr_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  changed text[] := '{}';
  actor text;
  rid text;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into changed
    from jsonb_object_keys(new_j) k
    where k not in ('updated_at', 'updated_by')
      and new_j->k is distinct from old_j->k;
    -- Skip no-op saves.
    if array_length(changed, 1) is null then
      return new;
    end if;
  end if;

  select lower(u.email) into actor from auth.users u where u.id = auth.uid();
  rid := coalesce(new_j->>'id', old_j->>'id', new_j->>'key', old_j->>'key', '');

  insert into audit_log (table_name, operation, row_id, actor_email, changed_fields, old_data, new_data)
  values (
    tg_table_name,
    tg_op,
    rid,
    coalesce(actor, case when auth.role() = 'anon' then 'anonymous' else 'system' end),
    changed,
    public.rr_audit_redact(tg_table_name, old_j),
    public.rr_audit_redact(tg_table_name, new_j)
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_users', 'app_settings', 'clients', 'vendors', 'crm', 'quotations',
    'invoices', 'delivery_notes', 'products', 'income', 'expenses',
    'payment_log', 'customer_payments', 'customer_refunds',
    'supplier_commitments', 'wanders_deals', 'customer_bookings',
    'customer_documents', 'quote_templates'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists rr_audit on public.%I', t);
      execute format(
        'create trigger rr_audit after insert or update or delete on public.%I
           for each row execute function public.rr_audit_trigger()',
        t
      );
    end if;
  end loop;
end $$;

-- Keep two years of history by default. Call from the SQL editor or pg_cron:
--   select public.rr_audit_prune();
create or replace function public.rr_audit_prune(keep interval default interval '2 years')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from audit_log where created_at < now() - keep;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.rr_audit_prune(interval) from public, anon, authenticated;
