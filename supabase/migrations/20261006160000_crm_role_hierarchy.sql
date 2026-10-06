-- CRM hierarchy: admin > manager > sales
-- Manager can run the pipeline without Settings / secrets / hard finance deletes.

alter table app_users drop constraint if exists app_users_role_check;
alter table app_users
  add constraint app_users_role_check
  check (role in ('admin', 'manager', 'sales'));

create or replace function public.rr_is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.app_users au
    where lower(au.email) = public.rr_current_email()
      and au.active
      and au.role in ('admin', 'manager')
  )
$$;

revoke all on function public.rr_is_manager_or_admin() from public;
grant execute on function public.rr_is_manager_or_admin() to authenticated;

comment on function public.rr_is_manager_or_admin() is
  'True when the signed-in staff user is an active admin or manager.';
