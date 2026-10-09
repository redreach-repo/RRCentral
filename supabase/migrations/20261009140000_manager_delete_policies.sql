-- Align DELETE (and CRM owner reassignment) with UI permissions:
-- sales may create/update CRM & quotes; only manager/admin may delete them.
-- Requires public.rr_is_manager_or_admin() from 20261006160000_crm_role_hierarchy.sql.

do $$
declare
  t text;
begin
  foreach t in array array['crm', 'quotations', 'clients', 'follow_up_updates'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Staff read', t);
    execute format('drop policy if exists %I on public.%I', 'Staff insert', t);
    execute format('drop policy if exists %I on public.%I', 'Staff update', t);
    execute format('drop policy if exists %I on public.%I', 'Managers delete', t);

    execute format(
      'create policy "Staff read" on public.%I for select to authenticated using (public.rr_is_staff())',
      t
    );
    execute format(
      'create policy "Staff insert" on public.%I for insert to authenticated with check (public.rr_is_staff())',
      t
    );
    execute format(
      'create policy "Staff update" on public.%I for update to authenticated using (public.rr_is_staff()) with check (public.rr_is_staff())',
      t
    );
    execute format(
      'create policy "Managers delete" on public.%I for delete to authenticated using (public.rr_is_manager_or_admin())',
      t
    );
  end loop;
end $$;

-- Sales may not reassign CRM owner after create (UI disables the control; enforce in DB).
create or replace function public.rr_crm_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'UPDATE'
     and new.owner is distinct from old.owner
     and not public.rr_is_manager_or_admin() then
    raise exception 'Only managers and admins can reassign CRM owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rr_crm_owner_guard on public.crm;
create trigger rr_crm_owner_guard
  before update on public.crm
  for each row execute function public.rr_crm_owner_guard();

notify pgrst, 'reload schema';
