-- HighMast MCP server: admin keys (Alfred, 2026-11-20).
--
-- Adds a second kind of AI connector key, scope "admin", for a dedicated
-- "AI Assistant" admin member. Standard keys (sales, staff, viewer) keep
-- exactly the limits of 20261323090000_highmast_mcp.sql.
--
-- What an admin key may do, enforced here in the database and not only in the
-- Edge Function:
--   * read and write every business table, HR and payroll included;
--   * never settings, secrets, keys, mail or Drive tokens, users or the
--     workflow / numbering / pipeline configuration;
--   * never a hard delete: records are soft deleted (deleted_at) and can be
--     restored. The one exception is replacing the lines of a DRAFT quote or
--     invoice, which is how the app saves lines too;
--   * a finalized or sent invoice cannot be changed (only its payment status,
--     which a payment updates), and a recorded payment can never be changed:
--     corrections are a credit note or a payment reversal;
--   * a quote that is no longer Draft only moves status (Sent, Awarded ...);
--   * payroll runs stay draft: an AI session can never approve, pay or void
--     one; leave requests cannot be approved or rejected by the AI;
--   * every write goes to audit_log (operation MCP_WRITE) with the tool, its
--     inputs, the record id and the record before and after (salary, IBAN
--     and ID numbers hidden).
--
-- The write functions below run as the caller (security invoker), so row
-- level security still applies to everything they do.
--
-- Changes no existing data. Safe to re-run. Run after 20261323090000_highmast_mcp.sql.
-- NOTE: 20260926090000_security_rls.sql drops every policy when re-run. If it
-- is ever re-run, re-run 20261323090000_highmast_mcp.sql and then this file.

set client_min_messages = warning;

------------------------------------------------------------
-- 1. Keys get a scope
------------------------------------------------------------
alter table public.mcp_keys add column if not exists scope text not null default 'standard';
alter table public.mcp_keys drop constraint if exists mcp_keys_scope_check;
alter table public.mcp_keys add constraint mcp_keys_scope_check check (scope in ('standard', 'admin'));
alter table public.mcp_keys drop constraint if exists mcp_keys_role_check;
alter table public.mcp_keys add constraint mcp_keys_role_check check (role in ('sales', 'staff', 'viewer', 'admin'));
-- Admin keys act as an admin member, standard keys never do.
alter table public.mcp_keys drop constraint if exists mcp_keys_scope_role_check;
alter table public.mcp_keys add constraint mcp_keys_scope_role_check check ((scope = 'admin') = (role = 'admin'));

drop policy if exists "Admins create AI keys" on public.mcp_keys;
create policy "Admins create AI keys" on public.mcp_keys
  for insert to authenticated
  with check (
    public.rr_is_admin()
    and revoked_at is null
    and rate_count = 0
    and exists (
      select 1 from public.app_users u
      where u.id = acts_as_user_id and u.active and u.role = mcp_keys.role
        -- An admin key acts as its own AI Assistant member, never as the person creating it.
        and (mcp_keys.scope = 'standard' or lower(u.email) <> lower(coalesce(public.rr_current_email(), '')))
    )
  );

comment on table public.mcp_keys is
  'AI connector (MCP) keys: SHA-256 hash only. Standard keys act as a sales/staff/viewer member; admin keys as a dedicated AI Assistant admin member. Admin only.';

------------------------------------------------------------
-- 2. Resolve a key (now also returns the scope)
------------------------------------------------------------
drop function if exists public.rr_mcp_resolve_key(text);
create function public.rr_mcp_resolve_key(p_key_hash text)
returns table (
  key_id uuid,
  key_name text,
  role text,
  scope text,
  member_id uuid,
  member_name text,
  member_email text,
  auth_user_id uuid,
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  k public.mcp_keys%rowtype;
  u public.app_users%rowtype;
  au uuid;
  w timestamptz := date_trunc('minute', now());
  n integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select * into k from public.mcp_keys m where m.key_hash = p_key_hash and m.revoked_at is null for update;
  if not found then
    return;
  end if;
  select * into u from public.app_users a where a.id = k.acts_as_user_id;
  -- The member must still be active and still have the key's role (no quiet promotion).
  if not found or not u.active or u.role is distinct from k.role then
    return;
  end if;
  if not ((k.scope = 'standard' and k.role in ('sales', 'staff', 'viewer')) or (k.scope = 'admin' and k.role = 'admin')) then
    return;
  end if;
  select x.id into au from auth.users x
  where lower(x.email) = lower(u.email) and x.email_confirmed_at is not null
  limit 1;
  if au is null then
    return;
  end if;

  n := case when k.rate_window_start = w then k.rate_count + 1 else 1 end;
  update public.mcp_keys
     set rate_window_start = w,
         rate_count = n,
         last_used_at = now()
   where id = k.id;

  key_id := k.id;
  key_name := k.name;
  role := k.role;
  scope := k.scope;
  member_id := u.id;
  member_name := u.name;
  member_email := lower(u.email);
  auth_user_id := au;
  allowed := n <= 60;
  retry_after_seconds := greatest(1, 60 - extract(second from now())::integer);
  return next;
end $$;

revoke all on function public.rr_mcp_resolve_key(text) from public;
grant execute on function public.rr_mcp_resolve_key(text) to anon, authenticated;

------------------------------------------------------------
-- 3. Is this an AI session with a live admin key?
------------------------------------------------------------
create or replace function public.rr_mcp_admin_key()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mcp_keys k
    where k.id = public.rr_mcp_key_id() and k.scope = 'admin' and k.revoked_at is null
  )
$$;
revoke all on function public.rr_mcp_admin_key() from public;
grant execute on function public.rr_mcp_admin_key() to authenticated;

-- Tables an admin key may never write (configuration, people, secrets, tokens).
create or replace function public.rr_mcp_admin_never_write()
returns text[]
language sql
immutable
as $$
  select array[
    'app_users', 'app_settings', 'audit_log', 'fle_access_log', 'api_keys', 'mcp_keys',
    'webhook_endpoints', 'webhook_delivery_attempts', 'mail_accounts', 'mail_links',
    'gmail_connection', 'drive_connection', 'm365_connection', 'tenant_app_identities',
    'mfa_passkey_stubs', 'rate_limit_buckets', 'tenants', 'tenant_subscriptions',
    'tenant_country_packs', 'tenant_industry_packs', 'country_packs', 'industry_packs',
    'business_type_packs', 'numbering_sequences', 'pipelines', 'pipeline_stages',
    'record_rules', 'workflow_definitions', 'workflow_runs', 'custom_field_definitions',
    'sla_policies', 'retention_runs', 'event_outbox', 'dsr_requests',
    'hubspot_links', 'hubspot_sync_runs', 'usage_import_runs', 'digest_runs',
    'fireflies_webhook_events', 'fireflies_webhook_maps', 'ai_usage_log', 'app_errors',
    'activity_log', 'gl_accounts'
  ]::text[]
$$;

-- Tables an admin key may never read (secrets and tokens; HR and payroll ARE readable).
create or replace function public.rr_mcp_admin_never_read()
returns text[]
language sql
immutable
as $$
  select array[
    'app_settings', 'fle_access_log', 'api_keys', 'mcp_keys', 'webhook_endpoints',
    'webhook_delivery_attempts', 'mail_accounts', 'gmail_connection', 'drive_connection',
    'm365_connection', 'tenant_app_identities', 'mfa_passkey_stubs', 'rate_limit_buckets'
  ]::text[]
$$;

------------------------------------------------------------
-- 4. Soft delete columns the app already knows about
------------------------------------------------------------
-- The app's soft delete migrations (20261305.. to 20261310..) add deleted_at to
-- these tables and the app hides rows that have it set. Adding the column again
-- here is harmless and makes delete / restore work even where those files were
-- not run. No other table gets a delete tool.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'account_contacts', 'crm', 'sales_deals', 'ctrm_deals', 'quotations', 'invoices',
    'customer_payments', 'expenses', 'tickets', 'customer_documents', 'company_documents',
    'delivery_projects', 'delivery_notes', 'purchase_orders', 'vendors', 'products',
    'hr_employees', 'hr_attendance_days', 'build_tasks', 'construction_sites', 'quote_templates',
    'eng_claims', 'eng_document_registers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    end if;
  end loop;
end $$;

------------------------------------------------------------
-- 5. Audit every AI write, with before and after
------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log
  add constraint audit_log_operation_check
  check (operation in ('INSERT', 'UPDATE', 'DELETE', 'MCP_CALL', 'MCP_WRITE'));

-- Salary, IBAN and ID numbers never go into the log, even for an admin key.
create or replace function public.rr_mcp_redact(p_row jsonb)
returns jsonb
language sql
immutable
as $$
  select case when p_row is null then null else (
    select coalesce(jsonb_object_agg(
      e.key,
      case
        when e.key in ('basic_salary_aed', 'iban', 'labour_card_no', 'bank_routing_code', 'pay_enc', 'image_data')
          or e.key like '%\_enc' escape '\'
        then case when e.value is null or e.value = 'null'::jsonb or e.value = '""'::jsonb then e.value else '"[hidden]"'::jsonb end
        else e.value
      end), '{}'::jsonb)
    from jsonb_each(p_row) e
  ) end
$$;

create or replace function public.rr_mcp_log_write(
  p_tool text, p_args jsonb, p_table text, p_record_id text, p_before jsonb, p_after jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  k public.mcp_keys%rowtype;
  actor text;
  changed text[];
begin
  select * into k from public.mcp_keys m
  where m.id = public.rr_mcp_key_id() and m.scope = 'admin' and m.revoked_at is null;
  if not found then
    raise exception 'Only an AI session with a live admin key can log AI writes' using errcode = '42501';
  end if;
  select lower(x.email) into actor from auth.users x where x.id = auth.uid();
  select coalesce(array_agg(a.key order by a.key), '{}') into changed
  from jsonb_each(coalesce(p_after, '{}'::jsonb)) a
  where p_before is null or a.value is distinct from (p_before -> a.key);
  insert into public.audit_log (table_name, operation, row_id, actor_email, changed_fields, old_data, new_data)
  values (
    left(coalesce(p_table, ''), 80),
    'MCP_WRITE',
    left(coalesce(p_record_id, ''), 80),
    coalesce(actor, '') || ' (AI key: ' || k.name || ')',
    changed,
    public.rr_mcp_redact(p_before),
    jsonb_build_object(
      'tool', left(coalesce(p_tool, ''), 60),
      'key_id', k.id,
      'key_name', k.name,
      'args', public.rr_mcp_redact(coalesce(p_args, '{}'::jsonb)),
      'after', public.rr_mcp_redact(p_after)
    )
  );
end $$;
revoke all on function public.rr_mcp_log_write(text, jsonb, text, text, jsonb, jsonb) from public;
grant execute on function public.rr_mcp_log_write(text, jsonb, text, text, jsonb, jsonb) to authenticated;

------------------------------------------------------------
-- 6. Guards that hold whatever the function does
------------------------------------------------------------
-- Only bite for AI sessions (rr_mcp_key_id() set). People are not affected.
create or replace function public.rr_mcp_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  o jsonb;
  n jsonb;
  k text;
  allowed text[];
  doc_status text;
  has_lines boolean;
  l_type text;
  l_ref text;
begin
  if public.rr_mcp_key_id() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name in ('payment_log', 'customer_payments', 'customer_refunds') then
    if tg_op = 'UPDATE' then
      raise exception 'A recorded payment cannot be changed by the AI. Use reverse_payment.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'payroll_runs' then
    if tg_op = 'UPDATE' then
      if old.status <> 'draft' then
        raise exception 'Only draft payroll runs can be changed by the AI.' using errcode = '42501';
      end if;
    end if;
    if new.status <> 'draft' or new.approved_by is not null then
      raise exception 'The AI keeps payroll runs as drafts. A person approves and pays them in HighMast.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'hr_leave_requests' then
    if new.status not in ('pending', 'canceled') then
      if tg_op = 'INSERT' then
        raise exception 'The AI cannot approve or reject leave. A manager decides in HighMast.' using errcode = '42501';
      elsif new.status is distinct from old.status then
        raise exception 'The AI cannot approve or reject leave. A manager decides in HighMast.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name in ('invoices', 'quotations') then
    if tg_op <> 'UPDATE' then
      return new;
    end if;
    if old.status = 'Draft' then
      return new;
    end if;
    allowed := case tg_table_name
      when 'invoices' then array['payment_status', 'updated_by', 'updated_at',
                                 'pay_link_id', 'pay_link_url', 'pay_link_amount', 'pay_link_created_at']
      else array['status', 'sent_at', 'followed_up_at', 'outcome_reason', 'updated_by', 'updated_at']
    end;
    o := to_jsonb(old);
    n := to_jsonb(new);
    for k in select key from jsonb_each(n) loop
      if (n -> k) is distinct from (o -> k) and not (k = any (allowed)) then
        raise exception '% % is % and cannot be edited by the AI (field %).%',
          case tg_table_name when 'invoices' then 'Invoice' else 'Quote' end,
          coalesce(old.reference_number, ''), old.status, k,
          case tg_table_name when 'invoices' then ' Use a credit note to correct it.' else ' Revise it in HighMast.' end
          using errcode = '42501';
      end if;
    end loop;
    if tg_table_name = 'quotations' and new.status = 'Draft' then
      raise exception 'A finalized quote cannot be turned back into a draft by the AI.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'line_items' then
    if tg_op = 'DELETE' then
      l_type := old.doc_type;
      l_ref := old.reference;
    else
      l_type := new.doc_type;
      l_ref := new.reference;
    end if;
    -- Lines may only change while their quote or invoice is a Draft. A new
    -- invoice (from a quote, or a credit note) may get its first lines.
    if l_type = 'Quote' then
      select q.status into doc_status from public.quotations q
      where q.quote_id = l_ref limit 1;
      if doc_status is not null and doc_status <> 'Draft' then
        raise exception 'Lines of a finalized quote cannot be changed by the AI.' using errcode = '42501';
      end if;
    elsif l_type = 'Invoice' then
      select i.status into doc_status from public.invoices i
      where i.reference_number = l_ref and i.status <> 'Draft' limit 1;
      if doc_status is not null then
        if tg_op <> 'INSERT' then
          raise exception 'Lines of a sent invoice cannot be changed by the AI. Use a credit note.' using errcode = '42501';
        end if;
        select exists (
          select 1 from public.line_items l where l.doc_type = 'Invoice' and l.reference = l_ref
        ) into has_lines;
        if has_lines then
          raise exception 'Lines of a sent invoice cannot be changed by the AI. Use a credit note.' using errcode = '42501';
        end if;
      end if;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['payment_log', 'customer_payments', 'customer_refunds', 'payroll_runs',
                           'hr_leave_requests', 'invoices', 'quotations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists rr_mcp_guard on public.%I', t);
      execute format('create trigger rr_mcp_guard before insert or update on public.%I
                        for each row execute function public.rr_mcp_guard()', t);
    end if;
  end loop;
  execute 'drop trigger if exists rr_mcp_guard on public.line_items';
  execute 'create trigger rr_mcp_guard before insert or update or delete on public.line_items
             for each row execute function public.rr_mcp_guard()';
end $$;

------------------------------------------------------------
-- 7. Row level security for AI sessions (replaces the loop in 20261323090000)
------------------------------------------------------------
do $$
declare
  t record;
  hidden text[] := array[
    'hr_employees', 'hr_attendance_days', 'hr_leave_requests',
    'payroll_runs', 'payroll_lines', 'payroll_exports',
    'fle_access_log', 'app_settings', 'audit_log',
    'api_keys', 'webhook_endpoints', 'webhook_delivery_attempts', 'mcp_keys',
    'mail_accounts', 'gmail_connection', 'drive_connection',
    'tenant_app_identities', 'mfa_passkey_stubs', 'rate_limit_buckets'
  ];
  insertable text[] := array[
    'accounts', 'account_contacts', 'account_activities',
    'crm', 'follow_up_updates', 'sales_deals', 'ctrm_deals', 'ctrm_deal_stage_changes',
    -- Overdue invoice chasing (20261328090000_ar_chase.sql): chase notes only.
    'invoice_chase_log'
  ];
  updatable text[] := array['crm', 'sales_deals', 'ctrm_deals', 'invoice_chase_tasks'];
  admin_read boolean;
  admin_write boolean;
begin
  for t in
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    admin_read := not (t.name = any (public.rr_mcp_admin_never_read()));
    admin_write := not (t.name = any (public.rr_mcp_admin_never_write()));

    -- No AI key ever hard deletes. Admin keys may replace draft lines (checked by rr_mcp_guard).
    execute format('drop policy if exists "MCP never deletes" on public.%I', t.name);
    if t.name = 'line_items' then
      execute format(
        'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
           using (public.rr_mcp_key_id() is null or public.rr_mcp_admin_key())', t.name);
    else
      execute format(
        'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
           using (public.rr_mcp_key_id() is null)', t.name);
    end if;

    execute format('drop policy if exists "MCP cannot read" on public.%I', t.name);
    if t.name = any (hidden) then
      execute format(
        'create policy "MCP cannot read" on public.%I as restrictive for select to authenticated
           using (public.rr_mcp_key_id() is null%s)', t.name,
        case when admin_read then ' or public.rr_mcp_admin_key()' else '' end);
    end if;

    execute format('drop policy if exists "MCP adds only leads and notes" on public.%I', t.name);
    if not (t.name = any (insertable)) then
      execute format(
        'create policy "MCP adds only leads and notes" on public.%I as restrictive for insert to authenticated
           with check (public.rr_mcp_key_id() is null%s)', t.name,
        case when admin_write then ' or public.rr_mcp_admin_key()' else '' end);
    end if;

    execute format('drop policy if exists "MCP changes only deals" on public.%I', t.name);
    if not (t.name = any (updatable)) then
      execute format(
        'create policy "MCP changes only deals" on public.%I as restrictive for update to authenticated
           using (public.rr_mcp_key_id() is null%s)', t.name,
        case when admin_write then ' or public.rr_mcp_admin_key()' else '' end);
    end if;
  end loop;
end $$;

------------------------------------------------------------
-- 8. Generic write, soft delete and restore (admin keys only)
------------------------------------------------------------
-- Columns the AI never sets directly on any table.
create or replace function public.rr_mcp_protected_column(p_col text)
returns boolean
language sql
immutable
as $$
  select p_col in ('id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by')
      or p_col like '%\_enc' escape '\'
$$;

create or replace function public.rr_mcp_require_admin(p_table text)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.rr_mcp_admin_key() then
    raise exception 'This needs an AI connector key with the admin scope.' using errcode = '42501';
  end if;
  if p_table is not null and (p_table = any (public.rr_mcp_admin_never_write())
       or to_regclass('public.' || quote_ident(p_table)) is null) then
    raise exception 'The AI cannot write to %.', p_table using errcode = '42501';
  end if;
end $$;

create or replace function public.rr_mcp_has_column(p_table text, p_col text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_col
  )
$$;

create or replace function public.rr_mcp_column_type(p_table text, p_col text)
returns text
language sql
stable
as $$
  select data_type from information_schema.columns
  where table_schema = 'public' and table_name = p_table and column_name = p_col
$$;

-- Insert (p_id null) or update one row. p_data holds only real, allowed
-- columns; anything else is refused. Returns the row after the change.
create or replace function public.rr_mcp_save(
  p_table text, p_id uuid, p_data jsonb, p_tool text default 'save', p_args jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  k text;
  cols text[] := '{}';
  data jsonb := coalesce(p_data, '{}'::jsonb);
  who text := lower(coalesce(public.rr_current_email(), ''));
  before_row jsonb;
  after_row jsonb;
  sets text;
begin
  perform public.rr_mcp_require_admin(p_table);
  if jsonb_typeof(data) <> 'object' then
    raise exception 'data must be an object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(data) loop
    if public.rr_mcp_protected_column(k) then
      raise exception 'Field % is set by HighMast, not by the AI.', k using errcode = '22023';
    end if;
    if not public.rr_mcp_has_column(p_table, k) then
      raise exception 'Unknown field % for %.', k, p_table using errcode = '22023';
    end if;
    cols := cols || k;
  end loop;

  if p_id is null then
    foreach k in array array['created_by', 'updated_by'] loop
      if public.rr_mcp_has_column(p_table, k) then
        -- Text columns hold the email, uuid columns the member id (as the app does).
        data := data || jsonb_build_object(k, case when public.rr_mcp_column_type(p_table, k) = 'uuid'
                                                   then to_jsonb(public.rr_current_user_id()) else to_jsonb(who) end);
        cols := cols || k;
      end if;
    end loop;
    if array_length(cols, 1) is null then
      raise exception 'Nothing to save' using errcode = '22023';
    end if;
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning to_jsonb(%1$I.*)',
      p_table, (select string_agg(quote_ident(c), ', ') from unnest(cols) c))
      using data into after_row;
  else
    execute format('select to_jsonb(t.*) from public.%I t where t.id = $1', p_table)
      using p_id into before_row;
    if before_row is null then
      raise exception 'No % record with id % (or not visible to this key).', p_table, p_id using errcode = 'P0002';
    end if;
    if before_row ? 'deleted_at' and before_row ->> 'deleted_at' is not null then
      raise exception 'That record is deleted. Restore it first.' using errcode = '22023';
    end if;
    if array_length(cols, 1) is null then
      raise exception 'Nothing to change' using errcode = '22023';
    end if;
    sets := (select string_agg(format('%1$I = r.%1$I', c), ', ') from unnest(cols) c);
    if public.rr_mcp_has_column(p_table, 'updated_at') then sets := sets || ', updated_at = now()'; end if;
    if public.rr_mcp_has_column(p_table, 'updated_by') then
      sets := sets || case when public.rr_mcp_column_type(p_table, 'updated_by') = 'uuid'
                           then ', updated_by = public.rr_current_user_id()' else format(', updated_by = %L', who) end;
    end if;
    execute format(
      'update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I, $1) r where t.id = $2 returning to_jsonb(t.*)',
      p_table, sets)
      using data, p_id into after_row;
    if after_row is null then
      raise exception 'This key cannot change that % record.', p_table using errcode = '42501';
    end if;
  end if;

  perform public.rr_mcp_log_write(p_tool, coalesce(p_args, data), p_table, after_row ->> 'id', before_row, after_row);
  return after_row;
end $$;

create or replace function public.rr_mcp_set_deleted(
  p_table text, p_id uuid, p_deleted boolean, p_tool text default 'delete_record', p_args jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  perform public.rr_mcp_require_admin(p_table);
  if not public.rr_mcp_has_column(p_table, 'deleted_at') then
    raise exception '% records cannot be deleted from the AI connector.', p_table using errcode = '42501';
  end if;
  execute format('select to_jsonb(t.*) from public.%I t where t.id = $1', p_table) using p_id into before_row;
  if before_row is null then
    raise exception 'No % record with id % (or not visible to this key).', p_table, p_id using errcode = 'P0002';
  end if;
  if p_deleted and before_row ->> 'deleted_at' is not null then
    raise exception 'Already deleted.' using errcode = '22023';
  end if;
  if not p_deleted and before_row ->> 'deleted_at' is null then
    raise exception 'That record is not deleted.' using errcode = '22023';
  end if;
  if p_deleted and p_table = 'customer_payments' then
    raise exception 'A recorded payment cannot be deleted. Use reverse_payment.' using errcode = '42501';
  end if;
  execute format('update public.%I t set deleted_at = %s where t.id = $1 returning to_jsonb(t.*)',
                 p_table, case when p_deleted then 'now()' else 'null' end)
    using p_id into after_row;
  if after_row is null then
    raise exception 'This key cannot change that % record.', p_table using errcode = '42501';
  end if;
  perform public.rr_mcp_log_write(p_tool, coalesce(p_args, jsonb_build_object('table', p_table, 'id', p_id)),
                                  p_table, p_id::text, before_row, after_row);
  return after_row;
end $$;

------------------------------------------------------------
-- 9. Quotes, invoices and payments (same rules as the app's screens)
------------------------------------------------------------
-- Next RR-{division}-{YY}{seq} reference. Uses the app's numbering function
-- when it exists, otherwise the app's fallback: highest used number + 1.
create or replace function public.rr_mcp_next_reference(p_doc_type text, p_division text, p_prefix text default 'RR')
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  div text := lpad(coalesce(nullif(trim(p_division), ''), '01'), 2, '0');
  pref text := upper(coalesce(nullif(trim(p_prefix), ''), 'RR'));
  yy text := to_char(now(), 'YY');
  ref text;
  m integer;
begin
  if to_regprocedure('public.rr_allocate_reference(text,text,text)') is not null then
    begin
      execute 'select public.rr_allocate_reference($1, $2, $3)' using p_doc_type, div, pref into ref;
      if coalesce(trim(ref), '') <> '' then
        return trim(ref);
      end if;
    exception when others then
      null; -- fall back like the app does
    end;
  end if;
  select coalesce(max(substring(r from '^' || pref || '-' || div || '-' || yy || '(\d{3})')::int), 0)
    into m
  from (
    select reference_number as r from public.quotations
    union all select reference_number from public.invoices
  ) x
  where r ~ ('^' || pref || '-' || div || '-' || yy || '\d{3}');
  return pref || '-' || div || '-' || yy || lpad((m + 1)::text, 3, '0');
end $$;

-- Lines: [{description, quantity, unit_price, discount_percent, unit_cost}].
-- A line discount is taken off the unit price (and noted in the remarks),
-- because HighMast lines have no discount column. Amounts round per line,
-- VAT is worked out on the document's taxable total, as calcTotals does.
create or replace function public.rr_mcp_write_lines(
  p_doc_type text, p_reference text, p_lines jsonb, p_vat_rate numeric, p_currency text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  l jsonb;
  i integer := 0;
  qty numeric;
  price numeric;
  disc numeric;
  unit numeric;
  amt numeric;
  sub numeric := 0;
  cost numeric := 0;
  cur text := upper(coalesce(nullif(p_currency, ''), 'AED'));
begin
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line is needed.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'At most 200 lines.' using errcode = '22023';
  end if;
  delete from public.line_items where doc_type = p_doc_type and reference = p_reference;
  for l in select value from jsonb_array_elements(p_lines) loop
    i := i + 1;
    qty := coalesce((l ->> 'quantity')::numeric, 0);
    price := coalesce((l ->> 'unit_price')::numeric, 0);
    disc := coalesce((l ->> 'discount_percent')::numeric, 0);
    if coalesce(trim(l ->> 'description'), '') = '' then
      raise exception 'Line % needs a description.', i using errcode = '22023';
    end if;
    if qty <= 0 or price < 0 or disc < 0 or disc > 100 then
      raise exception 'Line %: quantity must be above 0, unit price 0 or more, discount 0 to 100.', i using errcode = '22023';
    end if;
    unit := case when disc > 0 then public.rr_money_round(price * (1 - disc / 100), cur) else price end;
    amt := public.rr_money_round(qty * unit, cur);
    sub := sub + amt;
    cost := cost + qty * coalesce((l ->> 'unit_cost')::numeric, 0);
    insert into public.line_items (doc_type, reference, line_no, description, qty, unit_price, unit_cost,
                                   vat_rate, amount, vat_amount, line_total, remarks, sku)
    values (
      p_doc_type, p_reference, i, trim(l ->> 'description'), qty, unit,
      coalesce((l ->> 'unit_cost')::numeric, 0), p_vat_rate, amt,
      public.rr_money_round(amt * p_vat_rate, cur), amt + public.rr_money_round(amt * p_vat_rate, cur),
      concat_ws(' · ',
        nullif(trim(coalesce(l ->> 'remarks', '')), ''),
        case when disc > 0 then 'Line discount ' || trim(to_char(disc, 'FM990.##')) || '% off ' || price::text end),
      ''
    );
  end loop;
  return jsonb_build_object('subtotal', sub, 'cost', cost, 'lines', i);
end $$;

-- Document totals: discount (percent, then amount) off the subtotal, VAT on the rest.
create or replace function public.rr_mcp_doc_totals(
  p_subtotal numeric, p_vat_rate numeric, p_currency text,
  p_discount_percent numeric default 0, p_discount_amount numeric default 0, p_offset_vat boolean default false
)
returns jsonb
language plpgsql
immutable
as $$
declare
  cur text := upper(coalesce(nullif(p_currency, ''), 'AED'));
  disc numeric;
  taxable numeric;
  vat numeric;
begin
  if p_offset_vat and p_vat_rate > 0 then
    vat := public.rr_money_round(p_subtotal * p_vat_rate, cur);
    return jsonb_build_object('subtotal', p_subtotal, 'discount', vat, 'taxable', p_subtotal, 'vat', vat, 'total', p_subtotal);
  end if;
  disc := least(greatest(p_subtotal, 0),
    public.rr_money_round(greatest(p_subtotal, 0) * least(greatest(coalesce(p_discount_percent, 0), 0), 100) / 100, cur)
    + greatest(coalesce(p_discount_amount, 0), 0));
  taxable := greatest(p_subtotal - disc, 0);
  vat := public.rr_money_round(taxable * p_vat_rate, cur);
  return jsonb_build_object('subtotal', p_subtotal, 'discount', disc, 'taxable', taxable, 'vat', vat, 'total', taxable + vat);
end $$;

-- Create (p_id null) or update a DRAFT quote with its lines.
-- p_header: client, account_id, vertical, division_code, date, valid_until, currency, fx_rate,
--   description, notes, payment_terms, delivery_terms, moq, contact_name, contact_email,
--   contact_phone, discount_percent, discount_amount, deal_ref.
create or replace function public.rr_mcp_quote_save(
  p_id uuid, p_header jsonb, p_lines jsonb, p_vat_rate numeric default 0.05, p_args jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  h jsonb := coalesce(p_header, '{}'::jsonb);
  q public.quotations%rowtype;
  before_row jsonb;
  after_row jsonb;
  qid text;
  cur text := upper(coalesce(nullif(h ->> 'currency', ''), 'AED'));
  fx numeric := coalesce((h ->> 'fx_rate')::numeric, 1);
  lines jsonb;
  t jsonb;
  who text := lower(coalesce(public.rr_current_email(), ''));
  d date := coalesce((h ->> 'date')::date, current_date);
begin
  perform public.rr_mcp_require_admin('quotations');
  if p_vat_rate < 0 or p_vat_rate > 1 then
    raise exception 'VAT rate must be between 0 and 1 (0.05 is 5%%).' using errcode = '22023';
  end if;
  if cur <> 'AED' and fx <= 0 then
    raise exception 'A non-AED quote needs fx_rate (AED per 1 %).', cur using errcode = '22023';
  end if;
  if p_id is not null then
    select * into q from public.quotations where id = p_id;
    if not found then
      raise exception 'No quote with id %.', p_id using errcode = 'P0002';
    end if;
    if q.status <> 'Draft' then
      raise exception 'Quote % is %. Only Draft quotes can be edited.', q.reference_number, q.status using errcode = '22023';
    end if;
    if q.deleted_at is not null then
      raise exception 'That quote is deleted. Restore it first.' using errcode = '22023';
    end if;
    before_row := to_jsonb(q);
    qid := q.quote_id;
    cur := upper(coalesce(nullif(h ->> 'currency', ''), q.quotation_currency, q.currency, 'AED'));
    d := coalesce((h ->> 'date')::date, q.date, current_date);
  else
    if coalesce(trim(h ->> 'client'), '') = '' then
      raise exception 'A quote needs a client.' using errcode = '22023';
    end if;
    qid := 'Q-' || (floor(extract(epoch from clock_timestamp()) * 1000))::bigint::text;
  end if;

  if p_lines is not null then
    lines := public.rr_mcp_write_lines('Quote', qid, p_lines, p_vat_rate, cur);
  else
    select jsonb_build_object('subtotal', coalesce(sum(amount), 0), 'cost', coalesce(sum(qty * unit_cost), 0))
      into lines from public.line_items where doc_type = 'Quote' and reference = qid;
  end if;
  t := public.rr_mcp_doc_totals((lines ->> 'subtotal')::numeric, p_vat_rate, cur,
         coalesce((h ->> 'discount_percent')::numeric, q.discount_percent, 0),
         coalesce((h ->> 'discount_amount')::numeric, q.discount_amount, 0),
         coalesce(q.offset_vat, false));

  if p_id is null then
    insert into public.quotations (
      client, account_id, vertical, division_code, date, valid_until, description, notes,
      payment_terms, delivery_terms, moq, contact_name, contact_email, contact_phone,
      discount_percent, discount_amount, offset_vat, amount, currency, quotation_currency,
      payment_currency, fx_rate, base_amount, supplier_cost_base, estimated_gross_profit_base,
      status, reference_number, base_reference, revision, quote_id, deal_ref, created_by, updated_by
    ) values (
      trim(h ->> 'client'), (h ->> 'account_id')::uuid, coalesce(h ->> 'vertical', ''),
      coalesce(nullif(h ->> 'division_code', ''), '01'), d,
      coalesce((h ->> 'valid_until')::date, d + 14),
      coalesce(h ->> 'description', ''), coalesce(h ->> 'notes', ''),
      coalesce(h ->> 'payment_terms', ''), coalesce(h ->> 'delivery_terms', ''), coalesce(h ->> 'moq', ''),
      coalesce(h ->> 'contact_name', ''), coalesce(h ->> 'contact_email', ''), coalesce(h ->> 'contact_phone', ''),
      coalesce((h ->> 'discount_percent')::numeric, 0), coalesce((h ->> 'discount_amount')::numeric, 0), false,
      (t ->> 'total')::numeric, cur, cur, cur, fx,
      public.rr_money_round((t ->> 'total')::numeric * fx, 'AED'),
      public.rr_money_round((lines ->> 'cost')::numeric * fx, 'AED'),
      public.rr_money_round(((t ->> 'taxable')::numeric - (lines ->> 'cost')::numeric) * fx, 'AED'),
      'Draft', '', '', 0, qid, coalesce(h ->> 'deal_ref', ''), who, who
    ) returning * into q;
  else
    update public.quotations set
      client = coalesce(nullif(trim(h ->> 'client'), ''), client),
      account_id = coalesce((h ->> 'account_id')::uuid, account_id),
      vertical = coalesce(h ->> 'vertical', vertical),
      division_code = coalesce(nullif(h ->> 'division_code', ''), division_code),
      date = d,
      valid_until = coalesce((h ->> 'valid_until')::date, valid_until),
      description = coalesce(h ->> 'description', description),
      notes = coalesce(h ->> 'notes', notes),
      payment_terms = coalesce(h ->> 'payment_terms', payment_terms),
      delivery_terms = coalesce(h ->> 'delivery_terms', delivery_terms),
      moq = coalesce(h ->> 'moq', moq),
      contact_name = coalesce(h ->> 'contact_name', contact_name),
      contact_email = coalesce(h ->> 'contact_email', contact_email),
      contact_phone = coalesce(h ->> 'contact_phone', contact_phone),
      discount_percent = coalesce((h ->> 'discount_percent')::numeric, discount_percent),
      discount_amount = coalesce((h ->> 'discount_amount')::numeric, discount_amount),
      deal_ref = coalesce(h ->> 'deal_ref', deal_ref),
      amount = (t ->> 'total')::numeric,
      currency = cur, quotation_currency = cur, payment_currency = cur,
      fx_rate = fx,
      base_amount = public.rr_money_round((t ->> 'total')::numeric * fx, 'AED'),
      supplier_cost_base = public.rr_money_round((lines ->> 'cost')::numeric * fx, 'AED'),
      estimated_gross_profit_base = public.rr_money_round(((t ->> 'taxable')::numeric - (lines ->> 'cost')::numeric) * fx, 'AED'),
      updated_by = who, updated_at = now()
    where id = p_id
    returning * into q;
  end if;

  after_row := to_jsonb(q);
  perform public.rr_mcp_log_write(case when p_id is null then 'create_quote' else 'update_quote' end,
    coalesce(p_args, jsonb_build_object('header', h, 'lines', p_lines)), 'quotations', q.id::text, before_row, after_row);
  return jsonb_build_object('quote', after_row, 'totals', t || jsonb_build_object('currency', cur, 'vat_rate', p_vat_rate));
end $$;

create or replace function public.rr_mcp_quote_finalize(p_id uuid, p_prefix text default 'RR', p_args jsonb default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  before_row jsonb;
  ref text;
begin
  perform public.rr_mcp_require_admin('quotations');
  select * into q from public.quotations where id = p_id;
  if not found then
    raise exception 'No quote with id %.', p_id using errcode = 'P0002';
  end if;
  if q.status <> 'Draft' then
    raise exception 'Quote is % already. Only a Draft can be finalized.', q.status using errcode = '22023';
  end if;
  if coalesce(trim(q.client), '') = '' then
    raise exception 'The quote needs a client before it is finalized.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.line_items where doc_type = 'Quote' and reference = q.quote_id) then
    raise exception 'The quote has no lines.' using errcode = '22023';
  end if;
  before_row := to_jsonb(q);
  ref := public.rr_mcp_next_reference('quotation', q.division_code, p_prefix);
  update public.quotations set
    reference_number = ref,
    base_reference = ref,
    deal_ref = coalesce(nullif(trim(deal_ref), ''), ref),
    status = 'Finalized',
    revision = coalesce(revision, 0),
    valid_until = coalesce(valid_until, coalesce(date, current_date) + 14),
    updated_by = lower(coalesce(public.rr_current_email(), '')),
    updated_at = now()
  where id = p_id
  returning * into q;
  perform public.rr_mcp_log_write('finalize_quote', coalesce(p_args, jsonb_build_object('quote_id', p_id)),
                                  'quotations', q.id::text, before_row, to_jsonb(q));
  return to_jsonb(q);
end $$;

create or replace function public.rr_mcp_quote_mark_sent(p_id uuid, p_args jsonb default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  before_row jsonb;
begin
  perform public.rr_mcp_require_admin('quotations');
  select * into q from public.quotations where id = p_id;
  if not found then
    raise exception 'No quote with id %.', p_id using errcode = 'P0002';
  end if;
  if q.status not in ('Finalized', 'Sent') then
    raise exception 'Quote is %. Finalize it before marking it sent.', q.status using errcode = '22023';
  end if;
  before_row := to_jsonb(q);
  update public.quotations
     set status = 'Sent', updated_by = lower(coalesce(public.rr_current_email(), '')), updated_at = now()
   where id = p_id
  returning * into q;
  perform public.rr_mcp_log_write('mark_quote_sent', coalesce(p_args, jsonb_build_object('quote_id', p_id)),
                                  'quotations', q.id::text, before_row, to_jsonb(q));
  return to_jsonb(q);
end $$;

-- Income row for an invoice (as InvoicesPage syncIncome does).
create or replace function public.rr_mcp_sync_income(p_invoice_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  i public.invoices%rowtype;
  v_sub numeric;
  v_vat numeric;
  cancelled boolean;
  pay text;
  existing uuid;
begin
  select * into i from public.invoices where id = p_invoice_id;
  if not found or coalesce(i.reference_number, '') = '' then
    return;
  end if;
  select coalesce(sum(amount), 0), coalesce(sum(vat_amount), 0) into v_sub, v_vat
  from public.line_items where doc_type = 'Invoice' and reference = i.reference_number;
  if v_sub = 0 and v_vat = 0 then
    v_sub := i.amount;
  else
    v_vat := i.amount - v_sub;
  end if;
  cancelled := lower(coalesce(i.status, '')) = 'cancelled';
  pay := case when cancelled then 'Pending' else coalesce(i.payment_status, 'Pending') end;
  select id into existing from public.income where reference_number = i.reference_number limit 1;
  if existing is not null then
    update public.income set
      client_source = i.client, category = coalesce(i.vertical, ''), date = i.date,
      description = coalesce(i.description, ''), bill_amount = v_sub, vat = v_vat, total_amount = i.amount,
      status = case when cancelled then 'Cancelled' when pay = 'Paid' then 'Paid' else 'Open' end,
      payment_status = pay
    where id = existing;
  elsif not cancelled then
    insert into public.income (client_source, category, reference_number, date, description,
                               bill_amount, vat, total_amount, status, payment_method, payment_status)
    values (i.client, coalesce(i.vertical, ''), i.reference_number, i.date, coalesce(i.description, ''),
            v_sub, v_vat, i.amount, case when pay = 'Paid' then 'Paid' else 'Open' end, '', pay);
  end if;
end $$;

-- Quote to invoice, like the Convert to invoice button: same reference,
-- status Sent, payment Pending, optional deposit percent, quote discount
-- baked into the unit prices.
create or replace function public.rr_mcp_quote_to_invoice(p_id uuid, p_percent numeric default 100, p_args jsonb default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  inv public.invoices%rowtype;
  pct numeric := least(100, greatest(0, coalesce(p_percent, 100)));
  rate numeric;
  sub_pre numeric;
  t jsonb;
  factor numeric := 1;
  cur text;
  offset_vat boolean;
  note text;
  l record;
  n integer := 0;
  unit numeric;
  amt numeric;
  sub numeric := 0;
  vat numeric;
  total numeric;
begin
  perform public.rr_mcp_require_admin('invoices');
  if pct <= 0 then
    raise exception 'percent must be between 1 and 100.' using errcode = '22023';
  end if;
  select * into q from public.quotations where id = p_id;
  if not found then
    raise exception 'No quote with id %.', p_id using errcode = 'P0002';
  end if;
  if coalesce(q.reference_number, '') = '' or q.status = 'Draft' then
    raise exception 'Finalize the quote before converting it.' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices where reference_number = q.reference_number) then
    raise exception 'An invoice already exists for %.', q.reference_number using errcode = '22023';
  end if;
  cur := upper(coalesce(nullif(q.quotation_currency, ''), nullif(q.currency, ''), 'AED'));
  offset_vat := coalesce(q.offset_vat, false);
  select coalesce(max(vat_rate), 0.05), coalesce(sum(public.rr_money_round(qty * public.rr_money_round(unit_price * pct / 100, cur), cur)), 0)
    into rate, sub_pre
  from public.line_items where doc_type = 'Quote' and reference = q.quote_id;
  if not exists (select 1 from public.line_items where doc_type = 'Quote' and reference = q.quote_id) then
    raise exception 'The quote has no lines.' using errcode = '22023';
  end if;
  t := public.rr_mcp_doc_totals(sub_pre, rate, cur,
         case when offset_vat then 0 else coalesce(q.discount_percent, 0) end,
         case when offset_vat then 0 else coalesce(q.discount_amount, 0) end, offset_vat);
  if not offset_vat and (t ->> 'discount')::numeric > 0 and sub_pre > 0 then
    factor := (t ->> 'taxable')::numeric / sub_pre;
  end if;

  note := case when pct < 100 then E'\nInvoice type: ' || trim(to_char(pct, 'FM990.##')) || '% deposit of quotation'
               else E'\nInvoice type: Full amount' end
       || case
            when offset_vat then E'\nVAT of ' || to_char((t ->> 'vat')::numeric, 'FM999999990.00') || ' given as a commercial discount; net '
                                 || to_char((t ->> 'total')::numeric, 'FM999999990.00')
            when coalesce(q.discount_percent, 0) <> 0 or coalesce(q.discount_amount, 0) <> 0 then
              E'\nDiscount applied from quotation: ' || coalesce(q.discount_percent, 0)::text || '%'
              || case when coalesce(q.discount_amount, 0) <> 0 then ' + ' || to_char(q.discount_amount, 'FM999999990.00') else '' end
            else '' end;


  for l in select * from public.line_items where doc_type = 'Quote' and reference = q.quote_id order by line_no loop
    n := n + 1;
    unit := public.rr_money_round(public.rr_money_round(l.unit_price * pct / 100, cur) * factor, cur);
    amt := public.rr_money_round(l.qty * unit, cur);
    sub := sub + amt;
    insert into public.line_items (doc_type, reference, line_no, description, qty, unit_price, unit_cost, vat_rate,
                                   amount, vat_amount, line_total, remarks, sku, sizes_json)
    values ('Invoice', q.reference_number, n,
            case when pct < 100 then l.description || ' (' || trim(to_char(pct, 'FM990.##')) || '% deposit)' else l.description end,
            l.qty, unit, l.unit_cost, l.vat_rate, amt, public.rr_money_round(amt * l.vat_rate, cur),
            amt + public.rr_money_round(amt * l.vat_rate, cur), l.remarks, l.sku, l.sizes_json);
  end loop;
  if offset_vat then
    total := (t ->> 'total')::numeric;
    vat := (t ->> 'vat')::numeric;
  else
    vat := public.rr_money_round(sub * rate, cur);
    total := sub + vat;
  end if;
  insert into public.invoices (client, vertical, account_id, reference_number, date, description, amount, currency,
                               status, payment_status, payment_terms, moq, notes, delivery_terms, created_by, updated_by)
  values (q.client, q.vertical, q.account_id, q.reference_number, current_date,
          case when pct < 100 then trim(coalesce(q.description, '') || ' (' || trim(to_char(pct, 'FM990.##')) || '% deposit)') else q.description end,
          total, cur, 'Sent', 'Pending', q.payment_terms, q.moq, coalesce(q.notes, '') || note, q.delivery_terms,
          lower(coalesce(public.rr_current_email(), '')), lower(coalesce(public.rr_current_email(), '')))
  returning * into inv;
  perform public.rr_mcp_sync_income(inv.id);
  perform public.rr_mcp_log_write('convert_quote_to_invoice', coalesce(p_args, jsonb_build_object('quote_id', p_id, 'percent', pct)),
                                  'invoices', inv.id::text, null, to_jsonb(inv));
  return jsonb_build_object('invoice', to_jsonb(inv), 'totals',
    jsonb_build_object('subtotal', sub, 'vat', vat, 'total', total, 'currency', cur));
end $$;

-- Create (p_id null) or update a DRAFT invoice. p_finalize gives it its
-- RR reference and status Sent (after which it is locked).
create or replace function public.rr_mcp_invoice_save(
  p_id uuid, p_header jsonb, p_lines jsonb, p_vat_rate numeric default 0.05, p_finalize boolean default false,
  p_args jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  h jsonb := coalesce(p_header, '{}'::jsonb);
  i public.invoices%rowtype;
  before_row jsonb;
  ref text;
  old_ref text;
  cur text;
  lines jsonb;
  t jsonb;
  who text := lower(coalesce(public.rr_current_email(), ''));
begin
  perform public.rr_mcp_require_admin('invoices');
  if p_vat_rate < 0 or p_vat_rate > 1 then
    raise exception 'VAT rate must be between 0 and 1 (0.05 is 5%%).' using errcode = '22023';
  end if;
  if p_id is not null then
    select * into i from public.invoices where id = p_id;
    if not found then
      raise exception 'No invoice with id %.', p_id using errcode = 'P0002';
    end if;
    if i.status <> 'Draft' then
      raise exception 'Invoice % is % and cannot be edited. Use a credit note.', i.reference_number, i.status using errcode = '22023';
    end if;
    if i.deleted_at is not null then
      raise exception 'That invoice is deleted. Restore it first.' using errcode = '22023';
    end if;
    before_row := to_jsonb(i);
    old_ref := i.reference_number;
    cur := upper(coalesce(nullif(h ->> 'currency', ''), nullif(i.currency, ''), 'AED'));
  else
    if coalesce(trim(h ->> 'client'), '') = '' then
      raise exception 'An invoice needs a client.' using errcode = '22023';
    end if;
    cur := upper(coalesce(nullif(h ->> 'currency', ''), 'AED'));
    old_ref := 'INV-DRAFT-' || (floor(extract(epoch from clock_timestamp()) * 1000))::bigint::text;
  end if;
  ref := old_ref;
  if p_finalize and (coalesce(ref, '') = '' or ref ~* '^INV-DRAFT-') then
    ref := public.rr_mcp_next_reference('invoice', coalesce(nullif(h ->> 'division_code', ''), '01'), 'RR');
  end if;

  -- Lines first (while the invoice is still a draft).
  if p_lines is not null then
    if ref <> old_ref and p_id is not null then
      delete from public.line_items where doc_type = 'Invoice' and reference = old_ref;
    end if;
    lines := public.rr_mcp_write_lines('Invoice', ref, p_lines, p_vat_rate, cur);
  else
    if p_id is null then
      raise exception 'A new invoice needs lines.' using errcode = '22023';
    end if;
    if ref <> old_ref then
      update public.line_items set reference = ref where doc_type = 'Invoice' and reference = old_ref;
    end if;
    select jsonb_build_object('subtotal', coalesce(sum(amount), 0)) into lines
    from public.line_items where doc_type = 'Invoice' and reference = ref;
  end if;
  t := public.rr_mcp_doc_totals((lines ->> 'subtotal')::numeric, p_vat_rate, cur);

  if p_id is null then
    insert into public.invoices (client, vertical, account_id, reference_number, date, description, amount, currency,
                                 status, payment_status, payment_terms, moq, notes, delivery_terms, created_by, updated_by)
    values (trim(h ->> 'client'), coalesce(h ->> 'vertical', ''), (h ->> 'account_id')::uuid, ref,
            coalesce((h ->> 'date')::date, current_date), coalesce(h ->> 'description', ''), (t ->> 'total')::numeric, cur,
            case when p_finalize then 'Sent' else 'Draft' end, 'Pending',
            coalesce(h ->> 'payment_terms', ''), coalesce(h ->> 'moq', ''), coalesce(h ->> 'notes', ''),
            coalesce(h ->> 'delivery_terms', ''), who, who)
    returning * into i;
  else
    update public.invoices set
      client = coalesce(nullif(trim(h ->> 'client'), ''), client),
      vertical = coalesce(h ->> 'vertical', vertical),
      account_id = coalesce((h ->> 'account_id')::uuid, account_id),
      reference_number = ref,
      date = coalesce((h ->> 'date')::date, date),
      description = coalesce(h ->> 'description', description),
      payment_terms = coalesce(h ->> 'payment_terms', payment_terms),
      moq = coalesce(h ->> 'moq', moq),
      notes = coalesce(h ->> 'notes', notes),
      delivery_terms = coalesce(h ->> 'delivery_terms', delivery_terms),
      amount = (t ->> 'total')::numeric,
      currency = cur,
      status = case when p_finalize then 'Sent' else status end,
      updated_by = who, updated_at = now()
    where id = p_id
    returning * into i;
  end if;
  perform public.rr_mcp_sync_income(i.id);
  perform public.rr_mcp_log_write(
    case when p_id is null then 'create_invoice' when p_finalize then 'finalize_invoice' else 'update_invoice' end,
    coalesce(p_args, jsonb_build_object('header', h, 'lines', p_lines, 'finalize', p_finalize)),
    'invoices', i.id::text, before_row, to_jsonb(i));
  return jsonb_build_object('invoice', to_jsonb(i), 'totals', t || jsonb_build_object('currency', cur, 'vat_rate', p_vat_rate));
end $$;

-- Paid so far on an invoice (payments minus reversals) and credit notes against it.
create or replace function public.rr_mcp_invoice_balance(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  i public.invoices%rowtype;
  paid numeric;
  credits numeric;
begin
  select * into i from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'No invoice with id %.', p_invoice_id using errcode = 'P0002';
  end if;
  select coalesce(sum(amount), 0) into paid from public.payment_log where invoice_ref = i.reference_number;
  select coalesce(-sum(amount), 0) into credits from public.invoices
  where reference_number like i.reference_number || '-CN%' and amount < 0 and deleted_at is null;
  return jsonb_build_object('invoice_id', i.id, 'reference', i.reference_number, 'amount', i.amount,
                            'paid', paid, 'credited', credits, 'balance', greatest(i.amount - paid - credits, 0),
                            'currency', coalesce(nullif(i.currency, ''), 'AED'));
end $$;

create or replace function public.rr_mcp_set_payment_status(p_invoice_id uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  b jsonb := public.rr_mcp_invoice_balance(p_invoice_id);
  st text;
begin
  st := case
    when (b ->> 'paid')::numeric + (b ->> 'credited')::numeric <= 0.009 then 'Pending'
    when (b ->> 'balance')::numeric <= 0.009 then 'Paid'
    else 'Partial' end;
  update public.invoices set payment_status = st, updated_by = lower(coalesce(public.rr_current_email(), '')), updated_at = now()
   where id = p_invoice_id;
  perform public.rr_mcp_sync_income(p_invoice_id);
  return st;
end $$;

create or replace function public.rr_mcp_record_payment(
  p_invoice_id uuid, p_amount numeric, p_date date, p_method text, p_reference text default '', p_notes text default '',
  p_args jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  i public.invoices%rowtype;
  b jsonb;
  p public.payment_log%rowtype;
  st text;
begin
  perform public.rr_mcp_require_admin('payment_log');
  select * into i from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'No invoice with id %.', p_invoice_id using errcode = 'P0002';
  end if;
  if lower(coalesce(i.status, '')) = 'cancelled' then
    raise exception 'Cancelled invoices cannot take payments.' using errcode = '22023';
  end if;
  if i.amount <= 0 then
    raise exception 'That is a credit note, not an invoice.' using errcode = '22023';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'amount must be above 0.' using errcode = '22023';
  end if;
  b := public.rr_mcp_invoice_balance(p_invoice_id);
  if p_amount > (b ->> 'balance')::numeric + 0.009 then
    raise exception 'That is more than the balance due (% %).', b ->> 'balance', b ->> 'currency' using errcode = '22023';
  end if;
  insert into public.payment_log (invoice_ref, client, amount, currency, method, notes, user_email, balance_after,
                                  external_ref, created_at)
  values (i.reference_number, i.client, p_amount, coalesce(nullif(i.currency, ''), 'AED'), coalesce(p_method, ''),
          coalesce(p_notes, ''), lower(coalesce(public.rr_current_email(), '')),
          greatest(public.rr_money_round((b ->> 'balance')::numeric - p_amount, coalesce(nullif(i.currency, ''), 'AED')), 0),
          coalesce(p_reference, ''),
          (coalesce(p_date, current_date)::text || 'T12:00:00+04:00')::timestamptz)
  returning * into p;
  st := public.rr_mcp_set_payment_status(p_invoice_id);
  perform public.rr_mcp_log_write('record_payment', coalesce(p_args, jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount)),
                                  'payment_log', p.id::text, null, to_jsonb(p));
  return jsonb_build_object('payment', to_jsonb(p), 'payment_status', st, 'balance', public.rr_mcp_invoice_balance(p_invoice_id));
end $$;

-- Reverse a payment: a matching negative entry; the original stays as it was.
create or replace function public.rr_mcp_reverse_payment(p_payment_id uuid, p_reason text, p_args jsonb default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  o public.payment_log%rowtype;
  r public.payment_log%rowtype;
  inv_id uuid;
  st text;
begin
  perform public.rr_mcp_require_admin('payment_log');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the reversal.' using errcode = '22023';
  end if;
  select * into o from public.payment_log where id = p_payment_id;
  if not found then
    raise exception 'No payment with id %.', p_payment_id using errcode = 'P0002';
  end if;
  if o.amount <= 0 then
    raise exception 'That entry is itself a reversal.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_log where external_ref = 'reversal:' || o.id::text) then
    raise exception 'That payment was already reversed.' using errcode = '22023';
  end if;
  insert into public.payment_log (invoice_ref, client, amount, currency, method, notes, user_email, balance_after, external_ref)
  values (o.invoice_ref, o.client, -o.amount, o.currency, o.method,
          'Reversal of payment ' || o.id::text || ': ' || trim(p_reason),
          lower(coalesce(public.rr_current_email(), '')), o.balance_after + o.amount, 'reversal:' || o.id::text)
  returning * into r;
  select id into inv_id from public.invoices where reference_number = o.invoice_ref and amount > 0 limit 1;
  if inv_id is not null then
    st := public.rr_mcp_set_payment_status(inv_id);
  end if;
  perform public.rr_mcp_log_write('reverse_payment', coalesce(p_args, jsonb_build_object('payment_id', p_payment_id, 'reason', p_reason)),
                                  'payment_log', r.id::text, to_jsonb(o), to_jsonb(r));
  return jsonb_build_object('reversal', to_jsonb(r), 'payment_status', st);
end $$;

-- Credit note against a sent invoice: its own document {ref}-CN{n} with a
-- negative amount (VAT included), plus its line and income row.
create or replace function public.rr_mcp_credit_note(p_invoice_id uuid, p_amount numeric, p_reason text, p_args jsonb default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  i public.invoices%rowtype;
  cn public.invoices%rowtype;
  b jsonb;
  n integer;
  ref text;
  cur text;
  rate numeric;
  net numeric;
  vat numeric;
begin
  perform public.rr_mcp_require_admin('invoices');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the credit note.' using errcode = '22023';
  end if;
  select * into i from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'No invoice with id %.', p_invoice_id using errcode = 'P0002';
  end if;
  if i.status = 'Draft' then
    raise exception 'A draft invoice can simply be edited; credit notes are for sent invoices.' using errcode = '22023';
  end if;
  if i.amount <= 0 or i.reference_number ~ '-CN\d+$' then
    raise exception 'That is already a credit note.' using errcode = '22023';
  end if;
  b := public.rr_mcp_invoice_balance(p_invoice_id);
  if coalesce(p_amount, 0) <= 0 or p_amount > i.amount - (b ->> 'credited')::numeric + 0.009 then
    raise exception 'amount must be above 0 and at most % (invoice total less earlier credit notes).',
      i.amount - (b ->> 'credited')::numeric using errcode = '22023';
  end if;
  cur := coalesce(nullif(i.currency, ''), 'AED');
  select coalesce(max(vat_rate), 0.05) into rate from public.line_items where doc_type = 'Invoice' and reference = i.reference_number;
  net := public.rr_money_round(p_amount / (1 + rate), cur);
  vat := p_amount - net;
  select count(*) + 1 into n from public.invoices where reference_number like i.reference_number || '-CN%';
  ref := i.reference_number || '-CN' || n;
  insert into public.invoices (client, vertical, account_id, reference_number, date, description, amount, currency,
                               status, payment_status, payment_terms, notes, created_by, updated_by)
  values (i.client, i.vertical, i.account_id, ref, current_date,
          'Credit note against ' || i.reference_number || ': ' || trim(p_reason), -p_amount, cur, 'Sent', 'Paid',
          '', 'Credit note for invoice ' || i.reference_number,
          lower(coalesce(public.rr_current_email(), '')), lower(coalesce(public.rr_current_email(), '')))
  returning * into cn;
  insert into public.line_items (doc_type, reference, line_no, description, qty, unit_price, unit_cost, vat_rate,
                                 amount, vat_amount, line_total, remarks, sku)
  values ('Invoice', ref, 1, 'Credit: ' || trim(p_reason), 1, -net, 0, rate, -net, -vat, -p_amount,
          'Credit note against ' || i.reference_number, '');
  perform public.rr_mcp_sync_income(cn.id);
  perform public.rr_mcp_set_payment_status(p_invoice_id);
  perform public.rr_mcp_log_write('create_credit_note', coalesce(p_args, jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount, 'reason', p_reason)),
                                  'invoices', cn.id::text, null, to_jsonb(cn));
  return jsonb_build_object('credit_note', to_jsonb(cn), 'original_balance', public.rr_mcp_invoice_balance(p_invoice_id));
end $$;

------------------------------------------------------------
-- 10. Grants
------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'rr_mcp_save(text,uuid,jsonb,text,jsonb)',
    'rr_mcp_set_deleted(text,uuid,boolean,text,jsonb)',
    'rr_mcp_quote_save(uuid,jsonb,jsonb,numeric,jsonb)',
    'rr_mcp_quote_finalize(uuid,text,jsonb)',
    'rr_mcp_quote_mark_sent(uuid,jsonb)',
    'rr_mcp_quote_to_invoice(uuid,numeric,jsonb)',
    'rr_mcp_invoice_save(uuid,jsonb,jsonb,numeric,boolean,jsonb)',
    'rr_mcp_invoice_balance(uuid)',
    'rr_mcp_record_payment(uuid,numeric,date,text,text,text,jsonb)',
    'rr_mcp_reverse_payment(uuid,text,jsonb)',
    'rr_mcp_credit_note(uuid,numeric,text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'rr_mcp_require_admin(text)', 'rr_mcp_next_reference(text,text,text)',
    'rr_mcp_write_lines(text,text,jsonb,numeric,text)', 'rr_mcp_sync_income(uuid)',
    'rr_mcp_set_payment_status(uuid)', 'rr_mcp_has_column(text,text)', 'rr_mcp_column_type(text,text)'
  ] loop
    -- Helpers: callable inside the functions above, not on their own over the API.
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

reset client_min_messages;

notify pgrst, 'reload schema';
