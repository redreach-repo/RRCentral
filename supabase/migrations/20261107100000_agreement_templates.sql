begin;

-- RR Central roadmap item 10: contract and agreement generator.
--
-- agreement_templates: the service agreement wording, with {{placeholders}}
-- that RR Central fills in from each client's contract, package and rates
-- (usage caps, exit fee, data protection terms) to make the PDF.
--
-- Each version starts as a draft. Once the lawyer approves it, it is
-- locked: its wording can no longer be changed or deleted, and changes
-- start a new draft version. Only one version is approved at a time; the
-- one it replaces is kept as retired, as a record.
--
-- Every team member can read the templates (to make agreements); managers
-- and admins edit and approve them.
--
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.agreement_templates;
--   drop function if exists public.rr_agreement_template_lock();

create table if not exists public.agreement_templates (
  id uuid primary key default uuid_generate_v4(),
  version integer not null unique check (version > 0),
  title text not null default 'Service agreement',
  body text not null check (btrim(body) <> ''),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by text not null default '',
  approved_at timestamptz,
  approval_note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An approved (or retired) version always says who approved it and when.
  constraint agreement_templates_approval check (
    status = 'draft' or (btrim(approved_by) <> '' and approved_at is not null)
  )
);
create unique index if not exists agreement_templates_one_approved
  on public.agreement_templates ((true)) where status = 'approved';

-- Approved wording is locked.
create or replace function public.rr_agreement_template_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Approved agreement templates are kept as a record and cannot be deleted.';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
    new.body is distinct from old.body
    or new.title is distinct from old.title
    or new.version is distinct from old.version
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
  ) then
    raise exception 'An approved agreement template cannot be changed. Start a new draft instead.';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'A retired agreement template cannot be used again. Start a new draft from it instead.';
  end if;
  return new;
end $$;

drop trigger if exists rr_agreement_template_lock on public.agreement_templates;
create trigger rr_agreement_template_lock
  before update or delete on public.agreement_templates
  for each row execute function public.rr_agreement_template_lock();

------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------
alter table public.agreement_templates enable row level security;
revoke all on public.agreement_templates from anon;
grant select, insert, update, delete on public.agreement_templates to authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.agreement_templates;
drop policy if exists "Viewers read" on public.agreement_templates;

drop policy if exists "Members read agreement templates" on public.agreement_templates;
drop policy if exists "Managers edit agreement templates" on public.agreement_templates;
create policy "Members read agreement templates" on public.agreement_templates
  for select to authenticated using (public.rr_is_member());
create policy "Managers edit agreement templates" on public.agreement_templates
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    execute 'drop trigger if exists rr_audit on public.agreement_templates';
    execute 'create trigger rr_audit after insert or update or delete on public.agreement_templates
               for each row execute function public.rr_audit_trigger()';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
