-- Generated quote, invoice and delivery note PDFs (Alfred, 2026-11-21).
--
-- A private Storage bucket "generated-pdfs" holds the PDF the app makes with
-- Download PDF, at quotes/<number>.pdf, invoices/<number>.pdf and
-- delivery-notes/<number>.pdf. The AI connector (get_quote_pdf ...) hands out
-- only short signed links to these files; the bucket is never public.
--
-- Who may read or save a file: exactly whoever may see the document itself.
-- The policies look the document up under the caller's own row level security,
-- so the usual role rules and, for AI keys, the department rules apply.
-- Saving (overwriting) also needs a role that can make documents (not viewer).
-- Nothing deletes these files.
--
-- Render sessions (end of file): when get_quote_pdf asks the PDF renderer to
-- make a fresh copy, the renderer opens the document page in HighMast with a
-- 2 minute AI login that carries the claim hm_pdf_render. That login may read
-- what the document page needs to draw the letterhead (settings, client, CRM
-- row, lines) but can write nothing at all in the database.
-- If you re-run the AI connector SQL (highmast-mcp*.sql) later, re-run this
-- file after it.
--
-- Changes no existing data. Safe to re-run.

-- Which document a file name belongs to: ('quotations' | 'invoices' | 'delivery_notes', number).
create or replace function public.rr_generated_pdf_doc(p_name text)
returns table (doc_table text, doc_number text)
language sql
immutable
as $$
  select case split_part(p_name, '/', 1)
           when 'quotes' then 'quotations'
           when 'invoices' then 'invoices'
           when 'delivery-notes' then 'delivery_notes'
         end,
         nullif(regexp_replace(substr(p_name, length(split_part(p_name, '/', 1)) + 2), '\.pdf$', ''), '')
  where p_name ~ '^(quotes|invoices|delivery-notes)/[A-Za-z0-9._-]{1,80}\.pdf$'
$$;

-- Can the caller see the document this file is for? Runs as the caller (RLS applies).
create or replace function public.rr_generated_pdf_visible(p_name text)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  d record;
  found_it boolean := false;
begin
  select * into d from public.rr_generated_pdf_doc(p_name);
  if d.doc_table is null or d.doc_number is null then
    return false;
  end if;
  if d.doc_table = 'quotations' then
    select exists (select 1 from public.quotations q
                   where coalesce(nullif(q.reference_number, ''), q.quote_id) = d.doc_number) into found_it;
  elsif d.doc_table = 'invoices' then
    select exists (select 1 from public.invoices i where i.reference_number = d.doc_number) into found_it;
  elsif d.doc_table = 'delivery_notes' then
    select exists (select 1 from public.delivery_notes n where n.reference_number = d.doc_number) into found_it;
  end if;
  return coalesce(found_it, false);
end $$;
grant execute on function public.rr_generated_pdf_doc(text) to authenticated;
grant execute on function public.rr_generated_pdf_visible(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'No Supabase Storage here: skipping the generated-pdfs bucket.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('generated-pdfs', 'generated-pdfs', false, 20971520, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

  drop policy if exists "Generated PDFs: read when the document is visible" on storage.objects;
  create policy "Generated PDFs: read when the document is visible" on storage.objects
    for select to authenticated
    using (bucket_id = 'generated-pdfs' and public.rr_generated_pdf_visible(name));

  drop policy if exists "Generated PDFs: save when the document is visible" on storage.objects;
  create policy "Generated PDFs: save when the document is visible" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'generated-pdfs' and public.rr_current_role() in ('admin', 'manager', 'sales', 'staff')
                and public.rr_generated_pdf_visible(name));

  drop policy if exists "Generated PDFs: replace when the document is visible" on storage.objects;
  create policy "Generated PDFs: replace when the document is visible" on storage.objects
    for update to authenticated
    using (bucket_id = 'generated-pdfs' and public.rr_current_role() in ('admin', 'manager', 'sales', 'staff')
           and public.rr_generated_pdf_visible(name))
    with check (bucket_id = 'generated-pdfs' and public.rr_generated_pdf_visible(name));
end $$;

------------------------------------------------------------
-- PDF render sessions
------------------------------------------------------------
-- Is this an AI login made only to render one PDF? (claim hm_pdf_render = "quote:<id>")
create or replace function public.rr_mcp_pdf_render()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  raw text := nullif(current_setting('request.jwt.claims', true), '');
  v text;
begin
  if raw is null or public.rr_mcp_key_id() is null then
    return null;
  end if;
  begin
    v := raw::jsonb ->> 'hm_pdf_render';
  exception when others then
    return null;
  end;
  if v ~ '^(quote|invoice|delivery-note):[0-9a-fA-F-]{36}$' then
    return v;
  end if;
  return null;
end $$;
revoke all on function public.rr_mcp_pdf_render() from public;
grant execute on function public.rr_mcp_pdf_render() to anon, authenticated;

-- What the document page reads to draw a quote, invoice or delivery note.
create or replace function public.rr_mcp_pdf_render_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'app_settings', 'companies', 'brand_kits', 'app_users',
    'quotations', 'invoices', 'delivery_notes', 'line_items',
    'clients', 'crm', 'customer_documents', 'attachments'
  ]::text[]
$$;

-- For the renderer: is this token a live render login, and for which document?
create or replace function public.rr_pdf_render_check()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('ok', public.rr_mcp_pdf_render() is not null, 'document', public.rr_mcp_pdf_render())
$$;
revoke all on function public.rr_pdf_render_check() from public;
grant execute on function public.rr_pdf_render_check() to authenticated;

-- Department keys: a render login may read the page's tables (only those).
-- Same as 20261325090000_highmast_mcp_departments.sql plus the render line.
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
  if not p_write and public.rr_mcp_pdf_render() is not null and p_table = any (public.rr_mcp_pdf_render_tables()) then
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

set client_min_messages = warning;
do $$
declare
  t record;
begin
  -- Settings stay hidden from AI keys, except for a render login (secret settings
  -- stay hidden by the normal "non-secret settings" rule).
  if to_regclass('public.app_settings') is not null then
    drop policy if exists "MCP cannot read" on public.app_settings;
    create policy "MCP cannot read" on public.app_settings as restrictive for select to authenticated
      using (public.rr_mcp_key_id() is null or public.rr_mcp_pdf_render() is not null);
  end if;

  -- A render login writes nothing in the database (only the PDF file in Storage).
  for t in
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('drop policy if exists "PDF render reads only (add)" on public.%I', t.name);
    execute format('drop policy if exists "PDF render reads only (change)" on public.%I', t.name);
    execute format('drop policy if exists "PDF render reads only (remove)" on public.%I', t.name);
    execute format(
      'create policy "PDF render reads only (add)" on public.%I as restrictive for insert to authenticated
         with check ((select public.rr_mcp_pdf_render()) is null)', t.name);
    execute format(
      'create policy "PDF render reads only (change)" on public.%I as restrictive for update to authenticated
         using ((select public.rr_mcp_pdf_render()) is null)', t.name);
    execute format(
      'create policy "PDF render reads only (remove)" on public.%I as restrictive for delete to authenticated
         using ((select public.rr_mcp_pdf_render()) is null)', t.name);
  end loop;
end $$;
reset client_min_messages;

notify pgrst, 'reload schema';
