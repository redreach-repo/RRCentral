-- HighMast MCP server: assistants and departments per key (Alfred, 2026-11-21).
--
-- An admin picks, for each AI connector key:
--   * the assistant it is for (Grok Bot, Claude, ChatGPT or other), shown in
--     the audit log next to every change;
--   * one or more departments (sales, marketing, finance, hr, payroll,
--     operations, support, documents, admin). "admin" means every area.
--
-- A department key acts as an AI admin member, like the admin keys of
-- 20261324090000_highmast_mcp_admin.sql, and so keeps every rule from that
-- file (audit of every write, soft deletes only, sent invoices and payments
-- locked, payroll stays draft, leave never approved by the AI). On top of that
-- it may only read and write the tables of its departments: every public
-- table gets a restrictive policy "MCP department reach". A table no
-- department lists is for the "admin" department only, so a new table is
-- closed to department keys until it is added below.
--
-- Standard keys (sales, staff, viewer member, 14 tools) are not affected.
--
-- Changes no existing data. Safe to re-run. Run after
-- 20261324090000_highmast_mcp_admin.sql.

------------------------------------------------------------
-- 1. Keys get an assistant and departments
------------------------------------------------------------
create or replace function public.rr_mcp_department_list()
returns text[]
language sql
immutable
as $$
  select array['sales', 'marketing', 'finance', 'hr', 'payroll', 'operations', 'support', 'documents', 'admin']::text[]
$$;

alter table public.mcp_keys add column if not exists assistant text;
alter table public.mcp_keys add column if not exists departments text[] not null default '{}';

alter table public.mcp_keys drop constraint if exists mcp_keys_assistant_check;
alter table public.mcp_keys add constraint mcp_keys_assistant_check
  check (assistant is null or assistant in ('grok', 'claude', 'chatgpt', 'other'));

alter table public.mcp_keys drop constraint if exists mcp_keys_departments_check;
alter table public.mcp_keys add constraint mcp_keys_departments_check
  check (
    departments <@ array['sales', 'marketing', 'finance', 'hr', 'payroll', 'operations', 'support', 'documents', 'admin']::text[]
    -- Admin-scope keys need at least one department; standard keys have none.
    and ((scope = 'admin') = (cardinality(departments) > 0))
  );

comment on column public.mcp_keys.assistant is 'Which AI assistant the key is for: grok, claude, chatgpt or other.';
comment on column public.mcp_keys.departments is
  'Departments an admin-scope key may reach (sales, marketing, finance, hr, payroll, operations, support, documents, admin). Empty for standard keys.';

------------------------------------------------------------
-- 2. Resolve a key (now also returns assistant and departments)
------------------------------------------------------------
drop function if exists public.rr_mcp_resolve_key(text);
create function public.rr_mcp_resolve_key(p_key_hash text)
returns table (
  key_id uuid,
  key_name text,
  role text,
  scope text,
  assistant text,
  departments text[],
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
  if not ((k.scope = 'standard' and k.role in ('sales', 'staff', 'viewer'))
       or (k.scope = 'admin' and k.role = 'admin' and cardinality(k.departments) > 0)) then
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
  assistant := k.assistant;
  departments := k.departments;
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
-- 3. Which departments may read / write each table
------------------------------------------------------------
-- {"read": [...], "write": [...]}. Write implies read. Tables not listed are
-- for the admin department only. line_items follow their document (see 5).
create or replace function public.rr_mcp_table_departments(p_table text)
returns jsonb
language sql
immutable
as $$
  select case
    -- CRM
    when p_table in ('accounts', 'account_contacts') then
      '{"read":["sales","marketing","finance","operations","support","documents"],"write":["sales","marketing"]}'
    when p_table = 'account_activities' then
      '{"read":["sales","marketing","support"],"write":["sales","marketing","support"]}'
    when p_table in ('crm', 'sales_deals', 'ctrm_deals', 'ctrm_deal_stage_changes', 'follow_up_updates',
                     'ctrm_client_terms', 'ctrm_fit_sheets', 'ctrm_sessions', 'ctrm_deal_commissions',
                     'wanders_deals', 'requirements', 'quote_templates', 'quote_accept_links', 'quote_acceptances') then
      '{"read":["sales"],"write":["sales"]}'
    when p_table in ('pipelines', 'pipeline_stages') then
      '{"read":["sales"],"write":[]}'
    -- Client accounts
    when p_table = 'clients' then
      '{"read":["sales","finance","operations","support","documents"],"write":["sales","finance"]}'
    when p_table in ('client_purchase_orders', 'client_po_drawdowns') then
      '{"read":["sales","finance","operations"],"write":["sales","finance"]}'
    when p_table in ('client_uniform_staff', 'client_uniform_issues') then
      '{"read":["sales","operations"],"write":["sales","operations"]}'
    -- Quotes and invoices
    when p_table = 'quotations' then
      '{"read":["sales","finance"],"write":["sales","finance"]}'
    when p_table = 'invoices' then
      '{"read":["finance","sales"],"write":["finance"]}'
    when p_table in ('payment_log', 'customer_payments', 'customer_refunds', 'income', 'expenses', 'contracts',
                     'contract_invoices', 'contract_obligations', 'invoice_reminders', 'gl_journals',
                     'gl_journal_lines', 'project_billing_schedules', 'customer_bookings') then
      '{"read":["finance"],"write":["finance"]}'
    when p_table in ('gl_accounts', 'fx_rates') then
      '{"read":["finance"],"write":[]}'
    -- Operations and delivery
    when p_table = 'products' then
      '{"read":["sales","finance","operations"],"write":["operations"]}'
    when p_table = 'vendors' then
      '{"read":["operations","finance"],"write":["operations","finance"]}'
    when p_table in ('purchase_orders', 'purchase_order_lines', 'warehouses', 'warehouse_stock', 'inventory_movements',
                     'construction_sites', 'site_workforce_assignments', 'build_tasks', 'build_stages',
                     'delivery_projects', 'delivery_notes', 'delivery_packages', 'project_cost_lines',
                     'supplier_commitments') then
      '{"read":["operations"],"write":["operations"]}'
    when p_table = 'time_entries' then
      '{"read":["operations","support"],"write":["operations","support"]}'
    -- Support desk
    when p_table in ('tickets', 'ticket_messages') then
      '{"read":["support"],"write":["support"]}'
    -- Documents
    when p_table = 'customer_documents' then
      '{"read":["documents","sales"],"write":["documents"]}'
    when p_table in ('company_documents', 'attachments') then
      '{"read":["documents"],"write":["documents"]}'
    -- HR and payroll
    when p_table = 'hr_employees' then
      '{"read":["hr","payroll"],"write":["hr"]}'
    when p_table in ('hr_leave_requests', 'hr_attendance_days') then
      '{"read":["hr"],"write":["hr"]}'
    when p_table in ('payroll_runs', 'payroll_lines', 'payroll_exports') then
      '{"read":["payroll"],"write":["payroll"]}'
    -- Marketing
    when p_table in ('marketing_campaigns', 'marketing_segments', 'marketing_campaign_recipients') then
      '{"read":["marketing"],"write":["marketing"]}'
    when p_table = 'website_inquiries' then
      '{"read":["marketing","sales"],"write":["marketing"]}'
    -- Names of team members, for owners and assignees (users stay read only)
    when p_table = 'app_users' then
      '{"read":["sales","marketing","finance","hr","payroll","operations","support","documents"],"write":[]}'
    else '{"read":[],"write":[]}'
  end::jsonb
$$;

-- This session's key departments; empty for people and standard keys.
create or replace function public.rr_mcp_key_departments()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select k.departments from public.mcp_keys k
    where k.id = public.rr_mcp_key_id() and k.scope = 'admin' and k.revoked_at is null
  ), '{}'::text[])
$$;
revoke all on function public.rr_mcp_key_departments() from public;
grant execute on function public.rr_mcp_key_departments() to authenticated;

-- May this session read (p_write false) or write (true) p_table?
-- Always true for people and standard keys (their own policies apply).
create or replace function public.rr_mcp_dept_allows(p_table text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d text[];
  m jsonb;
  allowed text[];
begin
  if public.rr_mcp_key_id() is null or not public.rr_mcp_admin_key() then
    return true;
  end if;
  d := public.rr_mcp_key_departments();
  if 'admin' = any (d) then
    return true;
  end if;
  m := public.rr_mcp_table_departments(p_table);
  select coalesce(array_agg(x), '{}') into allowed
  from jsonb_array_elements_text(m -> 'write') x;
  if not p_write then
    allowed := allowed || coalesce((select array_agg(x) from jsonb_array_elements_text(m -> 'read') x), '{}');
  end if;
  return d && allowed;
end $$;
revoke all on function public.rr_mcp_dept_allows(text, boolean) from public;
grant execute on function public.rr_mcp_dept_allows(text, boolean) to authenticated;

-- What this session's key can reach, for the Edge Function to pick tools:
-- {"departments": [...], "read": [tables], "write": [tables]}.
create or replace function public.rr_mcp_reach()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text[] := '{}';
  w text[] := '{}';
  t record;
begin
  if public.rr_mcp_key_id() is null or not public.rr_mcp_admin_key() then
    return jsonb_build_object('departments', '[]'::jsonb, 'read', '[]'::jsonb, 'write', '[]'::jsonb);
  end if;
  for t in
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    if public.rr_mcp_dept_allows(t.name, false) and not (t.name = any (public.rr_mcp_admin_never_read())) then
      r := r || t.name::text;
    end if;
    if public.rr_mcp_dept_allows(t.name, true) and not (t.name = any (public.rr_mcp_admin_never_write())) then
      w := w || t.name::text;
    end if;
  end loop;
  return jsonb_build_object('departments', to_jsonb(public.rr_mcp_key_departments()), 'read', to_jsonb(r), 'write', to_jsonb(w));
end $$;
revoke all on function public.rr_mcp_reach() from public;
grant execute on function public.rr_mcp_reach() to authenticated;

------------------------------------------------------------
-- 4. Friendlier refusals in the write functions
------------------------------------------------------------
create or replace function public.rr_mcp_require_admin(p_table text)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.rr_mcp_admin_key() then
    raise exception 'This needs an AI connector key with departments (admin scope).' using errcode = '42501';
  end if;
  if p_table is not null and (p_table = any (public.rr_mcp_admin_never_write())
       or to_regclass('public.' || quote_ident(p_table)) is null) then
    raise exception 'The AI cannot write to %.', p_table using errcode = '42501';
  end if;
  if p_table is not null and not public.rr_mcp_dept_allows(p_table, true) then
    raise exception 'This key''s departments (%) do not cover %.',
      array_to_string(public.rr_mcp_key_departments(), ', '), p_table using errcode = '42501';
  end if;
end $$;

-- The audit row also names the assistant.
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
  who text;
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
  who := case k.assistant when 'grok' then 'Grok Bot' when 'claude' then 'Claude' when 'chatgpt' then 'ChatGPT'
                          when 'other' then 'Other AI' else null end;
  insert into public.audit_log (table_name, operation, row_id, actor_email, changed_fields, old_data, new_data)
  values (
    left(coalesce(p_table, ''), 80),
    'MCP_WRITE',
    left(coalesce(p_record_id, ''), 80),
    coalesce(actor, '') || ' (AI key: ' || k.name || coalesce(', ' || who, '') || ')',
    changed,
    public.rr_mcp_redact(p_before),
    jsonb_build_object(
      'tool', left(coalesce(p_tool, ''), 60),
      'key_id', k.id,
      'key_name', k.name,
      'assistant', k.assistant,
      'departments', to_jsonb(k.departments),
      'args', public.rr_mcp_redact(coalesce(p_args, '{}'::jsonb)),
      'after', public.rr_mcp_redact(p_after)
    )
  );
end $$;
revoke all on function public.rr_mcp_log_write(text, jsonb, text, text, jsonb, jsonb) from public;
grant execute on function public.rr_mcp_log_write(text, jsonb, text, text, jsonb, jsonb) to authenticated;

------------------------------------------------------------
-- 5. Row level security: department reach on every table
------------------------------------------------------------
do $$
declare
  t record;
  expr_r text;
  expr_w text;
begin
  for t in
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    if t.name = 'line_items' then
      -- Lines belong to their document: quote lines to quotations, invoice lines to invoices.
      expr_r := 'public.rr_mcp_dept_allows(case doc_type when ''Quote'' then ''quotations'' when ''Invoice'' then ''invoices'' else ''delivery_notes'' end, false)';
      expr_w := 'public.rr_mcp_dept_allows(case doc_type when ''Quote'' then ''quotations'' when ''Invoice'' then ''invoices'' else ''delivery_notes'' end, true)';
    elsif t.name in ('ar_chase_settings', 'invoice_chase_log', 'invoice_chase_tasks') then
      -- Overdue invoice chasing (20261328090000_ar_chase.sql) follows invoices:
      -- whoever reads invoices may log a chase or finish a chase task.
      expr_r := '(select public.rr_mcp_dept_allows(''invoices'', false))';
      expr_w := expr_r;
    elsif t.name in ('quote_chase_settings', 'quote_chase_log', 'quote_chase_tasks') then
      -- Quote follow-up chasing (20261334090000_quote_chase.sql) follows quotes:
      -- whoever reads quotes may log a follow-up or finish a follow-up task.
      expr_r := '(select public.rr_mcp_dept_allows(''quotations'', false))';
      expr_w := expr_r;
    elsif t.name = 'quote_notes' then
      -- Quote notes (20261329090000_quote_revisions.sql) follow quotes:
      -- whoever reads quotes may add a note.
      expr_r := '(select public.rr_mcp_dept_allows(''quotations'', false))';
      expr_w := expr_r;
    else
      -- Wrapped in a sub-select so it is worked out once per query, not per row.
      expr_r := format('(select public.rr_mcp_dept_allows(%L, false))', t.name);
      expr_w := format('(select public.rr_mcp_dept_allows(%L, true))', t.name);
    end if;

    execute format('drop policy if exists "MCP department reach" on public.%I', t.name);
    execute format('drop policy if exists "MCP department reach (add)" on public.%I', t.name);
    execute format('drop policy if exists "MCP department reach (change)" on public.%I', t.name);
    execute format('drop policy if exists "MCP department reach (remove)" on public.%I', t.name);

    execute format(
      'create policy "MCP department reach" on public.%I as restrictive for select to authenticated using (%s)',
      t.name, expr_r);
    execute format(
      'create policy "MCP department reach (add)" on public.%I as restrictive for insert to authenticated with check (%s)',
      t.name, expr_w);
    execute format(
      'create policy "MCP department reach (change)" on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
      t.name, expr_w, expr_w);
    execute format(
      'create policy "MCP department reach (remove)" on public.%I as restrictive for delete to authenticated using (%s)',
      t.name, expr_w);
  end loop;
end $$;

comment on table public.mcp_keys is
  'AI connector (MCP) keys: SHA-256 hash only. Standard keys act as a sales/staff/viewer member; department (admin scope) keys as an AI admin member limited to their departments. Admin only.';
