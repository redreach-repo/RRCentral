-- Pick the pages each person sees (Settings, Users, edit a person).
--
-- user_hidden_pages: one row per sidebar page an admin has hidden from one
-- team member. The app drops those links from the sidebar, the phone menu and
-- Cmd+K, and shows the "no access" page when the address is typed.
--
-- This only hides pages. What a person may read or change is still decided by
-- their role and the Sales lock policies (20261332090000_sales_own_clients.sql),
-- so company money stays closed at database level whatever is picked here.
--
-- Rules:
--   * Only admins add or remove rows, in their own company.
--   * Admins cannot hide pages from an admin (so nobody locks Settings away).
--   * The person and managers can read the rows; nobody else can.
--   * Every change goes to the audit log.
--
-- Safe to re-run. Needs 20261213120000_platform_tenancy.sql and
-- 20261332090000_sales_own_clients.sql.
--
-- To reverse:
--   drop table if exists public.user_hidden_pages;
--   drop function if exists public.rr_user_hidden_page_stamp();

create table if not exists public.user_hidden_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  user_id uuid not null references public.app_users (id) on delete cascade,
  -- The sidebar link, e.g. /quotations or /hr/people.
  page_path text not null,
  hidden_by text not null default '',
  hidden_at timestamptz not null default now(),
  unique (user_id, page_path)
);

alter table public.user_hidden_pages drop constraint if exists user_hidden_pages_path_check;
alter table public.user_hidden_pages
  add constraint user_hidden_pages_path_check
  check (page_path ~ '^/[a-z0-9/_-]*$' and length(page_path) <= 80);

create index if not exists user_hidden_pages_user_idx on public.user_hidden_pages (user_id);

comment on table public.user_hidden_pages is
  'Sidebar pages an admin hid from one person (Settings, Users). Hides links only; roles and the Sales lock still decide data access.';

-- Stamp who hid it, copy the person''s company, refuse admins as targets.
create or replace function public.rr_user_hidden_page_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_role text;
  target_tenant uuid;
begin
  select au.role, au.tenant_id into target_role, target_tenant
  from public.app_users au where au.id = new.user_id;
  if target_role is null then
    raise exception 'No such team member';
  end if;
  if target_role = 'admin' then
    raise exception 'Admins always see every page';
  end if;
  if target_tenant is not null then
    new.tenant_id := target_tenant;
  end if;
  new.hidden_by := coalesce(public.rr_current_email(), '');
  new.hidden_at := now();
  return new;
end;
$$;

drop trigger if exists rr_user_hidden_page_stamp on public.user_hidden_pages;
create trigger rr_user_hidden_page_stamp
  before insert or update on public.user_hidden_pages
  for each row execute function public.rr_user_hidden_page_stamp();

alter table public.user_hidden_pages enable row level security;
revoke all on public.user_hidden_pages from anon;
grant select, insert, update, delete on public.user_hidden_pages to authenticated;

do $$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'user_hidden_pages' loop
    execute format('drop policy if exists %I on public.user_hidden_pages', p.policyname);
  end loop;
end $$;

create policy "Tenant isolation" on public.user_hidden_pages as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id));
create policy "Managers and the person read hidden pages" on public.user_hidden_pages
  for select to authenticated
  using (public.rr_is_manager_or_admin() or user_id = public.rr_current_user_id());
create policy "Admins pick pages" on public.user_hidden_pages
  for all to authenticated
  using (public.rr_is_admin()) with check (public.rr_is_admin());

-- The AI connector never changes who sees what (same guard as user_permissions).
do $$
begin
  if to_regprocedure('public.rr_mcp_key_id()') is null then
    return;
  end if;
  drop policy if exists "AI never writes access" on public.user_hidden_pages;
  create policy "AI never writes access" on public.user_hidden_pages as restrictive for all to authenticated
    using (true) with check (public.rr_mcp_key_id() is null);
  drop policy if exists "MCP never deletes" on public.user_hidden_pages;
  create policy "MCP never deletes" on public.user_hidden_pages as restrictive for delete to authenticated
    using (public.rr_mcp_key_id() is null);
end $$;

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.user_hidden_pages;
    create trigger rr_audit after insert or update or delete on public.user_hidden_pages
      for each row execute function public.rr_audit_trigger();
  else
    raise notice 'rr_audit_trigger missing, skipping audit on user_hidden_pages';
  end if;
end $$;

notify pgrst, 'reload schema';
