begin;

-- RR Central roadmap item 9: CRM build templates.
--
-- build_templates: a cloneable build checklist and starter configuration,
-- usually one per package (Starter, Growth, Done for you).
-- build_template_items: the template's lines. A 'task' is a checklist step
-- in a build stage with an hours estimate; a 'config' line is part of the
-- starter configuration and is copied in as a requirement.
-- build_tasks: each client's own build checklist, copied from a template
-- (or added by hand) and ticked off as the build goes.
--
-- Templates are read by every team member and changed by managers and
-- admins. A client's checklist follows the account, like build stages.
-- Adds three starter templates, never overwriting lines you have edited.
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.build_tasks;
--   drop table if exists public.build_template_items;
--   drop table if exists public.build_templates;

create table if not exists public.build_templates (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  -- The package this template is for. Null = any package.
  package_id uuid references public.delivery_packages(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.build_template_items (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.build_templates(id) on delete cascade,
  kind text not null default 'task' check (kind in ('task', 'config')),
  stage text check (stage in (
    'discovery', 'requirements_signed_off', 'build', 'whatsapp_setup', 'testing', 'live'
  )),
  title text not null check (btrim(title) <> ''),
  detail text not null default '',
  est_hours numeric(6,2) not null default 0 check (est_hours >= 0 and est_hours <= 200),
  sort integer not null default 0,
  -- Every checklist step sits in a build stage.
  constraint build_template_items_task_stage check (kind <> 'task' or stage is not null)
);
create index if not exists build_template_items_template_idx on public.build_template_items (template_id, sort);

create table if not exists public.build_tasks (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  template_id uuid references public.build_templates(id) on delete set null,
  stage text not null check (stage in (
    'discovery', 'requirements_signed_off', 'build', 'whatsapp_setup', 'testing', 'live'
  )),
  title text not null check (btrim(title) <> ''),
  detail text not null default '',
  est_hours numeric(6,2) not null default 0 check (est_hours >= 0 and est_hours <= 200),
  done boolean not null default false,
  done_at timestamptz,
  done_by text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists build_tasks_account_idx on public.build_tasks (account_id, sort);

------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['build_templates', 'build_template_items', 'build_tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    -- Never the blanket policies earlier migrations add on re-run.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Viewers read" on public.%I', t);
    execute format('drop policy if exists "Members read templates" on public.%I', t);
    execute format('drop policy if exists "Managers edit templates" on public.%I', t);
  end loop;
end $$;

create policy "Members read templates" on public.build_templates
  for select to authenticated using (public.rr_is_member());
create policy "Managers edit templates" on public.build_templates
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

create policy "Members read templates" on public.build_template_items
  for select to authenticated using (public.rr_is_member());
create policy "Managers edit templates" on public.build_template_items
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

drop policy if exists "Read build tasks on visible accounts" on public.build_tasks;
drop policy if exists "Write build tasks on editable accounts" on public.build_tasks;
create policy "Read build tasks on visible accounts" on public.build_tasks
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Write build tasks on editable accounts" on public.build_tasks
  for all to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));

-- Audit trail.
do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    return;
  end if;
  foreach t in array array['build_templates', 'build_template_items', 'build_tasks'] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()', t);
  end loop;
end $$;

------------------------------------------------------------
-- Starter templates, one per package (same lines as DEFAULT_BUILD_TEMPLATES
-- in app/src/lib/buildTemplates.ts)
------------------------------------------------------------
insert into public.build_templates (code, name, description, package_id)
  select 'starter', 'Starter build', 'Core CRM, contacts and WhatsApp. Aim for about 12 build hours.', (select id from public.delivery_packages where code = 'starter')
  on conflict (code) do nothing;
insert into public.build_templates (code, name, description, package_id)
  select 'growth', 'Growth build', 'Starter plus website leads, automations and lead scoring. Aim for about 20 build hours.', (select id from public.delivery_packages where code = 'growth')
  on conflict (code) do nothing;
insert into public.build_templates (code, name, description, package_id)
  select 'done_for_you', 'Done for you build', 'Growth plus data migration, AI replies and owner reports. Aim for about 30 build hours.', (select id from public.delivery_packages where code = 'done_for_you')
  on conflict (code) do nothing;

insert into public.build_template_items (template_id, kind, stage, title, detail, est_hours, sort)
select t.id, v.kind, v.stage, v.title, v.detail, v.est_hours, v.sort
from (values
  ('starter', 'task', 'discovery', 'Kick-off call', 'Agree goals, who does what, and the go-live date.', 1.00, 1),
  ('starter', 'task', 'discovery', 'Collect logo, brand colours, team list and contact spreadsheet', '', 0.50, 2),
  ('starter', 'task', 'requirements_signed_off', 'Walk the client through the starter configuration and get sign-off', '', 0.50, 3),
  ('starter', 'task', 'build', 'Create the CRM workspace from the starter configuration', '', 1.00, 4),
  ('starter', 'task', 'build', 'Set up pipeline stages and contact fields', '', 1.00, 5),
  ('starter', 'task', 'build', 'Import contacts from the client spreadsheet', '', 1.50, 6),
  ('starter', 'task', 'build', 'Add team users and roles', '', 0.50, 7),
  ('starter', 'task', 'whatsapp_setup', 'Connect the WhatsApp Business number', '', 1.00, 8),
  ('starter', 'task', 'whatsapp_setup', 'Submit message templates to Meta for approval', '', 1.00, 9),
  ('starter', 'task', 'whatsapp_setup', 'Set up the welcome auto reply', '', 0.50, 10),
  ('starter', 'task', 'testing', 'Test a lead from first message to won', '', 1.00, 11),
  ('starter', 'task', 'testing', 'Test WhatsApp send and receive on a real phone', '', 0.50, 12),
  ('starter', 'task', 'live', 'Training call with the client team', '', 1.00, 13),
  ('starter', 'task', 'live', 'Send handover notes and how to reach support', '', 0.50, 14),
  ('starter', 'task', 'live', 'Book the first monthly report call', '', 0.25, 15),
  ('starter', 'config', null, 'Pipeline stages', 'New lead, Contacted, Qualified, Quote sent, Won, Lost.', 0.00, 16),
  ('starter', 'config', null, 'Contact fields', 'Name, WhatsApp number, Email, Source, Interest, Owner.', 0.00, 17),
  ('starter', 'config', null, 'WhatsApp templates', 'Welcome, Follow up after 2 days, Appointment reminder.', 0.00, 18),
  ('starter', 'config', null, 'Monthly report', 'New leads by source, conversion rate, WhatsApp conversations used.', 0.00, 19),
  ('growth', 'task', 'discovery', 'Kick-off call', 'Agree goals, who does what, and the go-live date.', 1.00, 1),
  ('growth', 'task', 'discovery', 'Collect logo, brand colours, team list and contact spreadsheet', '', 0.50, 2),
  ('growth', 'task', 'requirements_signed_off', 'Walk the client through the starter configuration and get sign-off', '', 0.50, 3),
  ('growth', 'task', 'build', 'Create the CRM workspace from the starter configuration', '', 1.00, 4),
  ('growth', 'task', 'build', 'Set up pipeline stages and contact fields', '', 1.00, 5),
  ('growth', 'task', 'build', 'Import contacts from the client spreadsheet', '', 1.50, 6),
  ('growth', 'task', 'build', 'Add team users and roles', '', 0.50, 7),
  ('growth', 'task', 'whatsapp_setup', 'Connect the WhatsApp Business number', '', 1.00, 8),
  ('growth', 'task', 'whatsapp_setup', 'Submit message templates to Meta for approval', '', 1.00, 9),
  ('growth', 'task', 'whatsapp_setup', 'Set up the welcome auto reply', '', 0.50, 10),
  ('growth', 'task', 'testing', 'Test a lead from first message to won', '', 1.00, 11),
  ('growth', 'task', 'testing', 'Test WhatsApp send and receive on a real phone', '', 0.50, 12),
  ('growth', 'task', 'live', 'Training call with the client team', '', 1.00, 13),
  ('growth', 'task', 'live', 'Send handover notes and how to reach support', '', 0.50, 14),
  ('growth', 'task', 'live', 'Book the first monthly report call', '', 0.25, 15),
  ('growth', 'task', 'discovery', 'Map the current lead sources and follow-up process', '', 1.00, 16),
  ('growth', 'task', 'build', 'Connect the website lead form', '', 1.50, 17),
  ('growth', 'task', 'build', 'Set up follow-up reminders and task automations', '', 2.00, 18),
  ('growth', 'task', 'build', 'Set up lead scoring', '', 1.00, 19),
  ('growth', 'task', 'build', 'Build the team dashboard', '', 1.00, 20),
  ('growth', 'task', 'whatsapp_setup', 'Set up broadcast lists by segment', '', 1.00, 21),
  ('growth', 'task', 'testing', 'Test automations fire on time', '', 1.00, 22),
  ('growth', 'config', null, 'Pipeline stages', 'New lead, Contacted, Qualified, Quote sent, Won, Lost.', 0.00, 23),
  ('growth', 'config', null, 'Contact fields', 'Name, WhatsApp number, Email, Source, Interest, Owner.', 0.00, 24),
  ('growth', 'config', null, 'WhatsApp templates', 'Welcome, Follow up after 2 days, Appointment reminder.', 0.00, 25),
  ('growth', 'config', null, 'Monthly report', 'New leads by source, conversion rate, WhatsApp conversations used.', 0.00, 26),
  ('growth', 'config', null, 'Automations', 'Follow-up task 2 days after no reply. Move to Lost after 30 days quiet. Notify owner on new lead.', 0.00, 27),
  ('growth', 'config', null, 'Lead scoring', 'Points for source, budget and reply speed. Hot leads shown first.', 0.00, 28),
  ('growth', 'config', null, 'Segments', 'Broadcast lists for new leads, past customers and inactive contacts.', 0.00, 29),
  ('done_for_you', 'task', 'discovery', 'Kick-off call', 'Agree goals, who does what, and the go-live date.', 1.00, 1),
  ('done_for_you', 'task', 'discovery', 'Collect logo, brand colours, team list and contact spreadsheet', '', 0.50, 2),
  ('done_for_you', 'task', 'requirements_signed_off', 'Walk the client through the starter configuration and get sign-off', '', 0.50, 3),
  ('done_for_you', 'task', 'build', 'Create the CRM workspace from the starter configuration', '', 1.00, 4),
  ('done_for_you', 'task', 'build', 'Set up pipeline stages and contact fields', '', 1.00, 5),
  ('done_for_you', 'task', 'build', 'Import contacts from the client spreadsheet', '', 1.50, 6),
  ('done_for_you', 'task', 'build', 'Add team users and roles', '', 0.50, 7),
  ('done_for_you', 'task', 'whatsapp_setup', 'Connect the WhatsApp Business number', '', 1.00, 8),
  ('done_for_you', 'task', 'whatsapp_setup', 'Submit message templates to Meta for approval', '', 1.00, 9),
  ('done_for_you', 'task', 'whatsapp_setup', 'Set up the welcome auto reply', '', 0.50, 10),
  ('done_for_you', 'task', 'testing', 'Test a lead from first message to won', '', 1.00, 11),
  ('done_for_you', 'task', 'testing', 'Test WhatsApp send and receive on a real phone', '', 0.50, 12),
  ('done_for_you', 'task', 'live', 'Training call with the client team', '', 1.00, 13),
  ('done_for_you', 'task', 'live', 'Send handover notes and how to reach support', '', 0.50, 14),
  ('done_for_you', 'task', 'live', 'Book the first monthly report call', '', 0.25, 15),
  ('done_for_you', 'task', 'discovery', 'Map the current lead sources and follow-up process', '', 1.00, 16),
  ('done_for_you', 'task', 'build', 'Connect the website lead form', '', 1.50, 17),
  ('done_for_you', 'task', 'build', 'Set up follow-up reminders and task automations', '', 2.00, 18),
  ('done_for_you', 'task', 'build', 'Set up lead scoring', '', 1.00, 19),
  ('done_for_you', 'task', 'build', 'Build the team dashboard', '', 1.00, 20),
  ('done_for_you', 'task', 'whatsapp_setup', 'Set up broadcast lists by segment', '', 1.00, 21),
  ('done_for_you', 'task', 'testing', 'Test automations fire on time', '', 1.00, 22),
  ('done_for_you', 'task', 'discovery', 'Review the old CRM or spreadsheets for data to migrate', '', 1.00, 23),
  ('done_for_you', 'task', 'build', 'Migrate history from the old CRM', '', 2.50, 24),
  ('done_for_you', 'task', 'build', 'Set up the AI reply assistant with the client FAQ', '', 2.50, 25),
  ('done_for_you', 'task', 'build', 'Build custom reports for the owner', '', 1.50, 26),
  ('done_for_you', 'task', 'testing', 'Client team tests with real leads for a week', '', 1.00, 27),
  ('done_for_you', 'task', 'live', 'Second training call for managers', '', 1.00, 28),
  ('done_for_you', 'config', null, 'Pipeline stages', 'New lead, Contacted, Qualified, Quote sent, Won, Lost.', 0.00, 29),
  ('done_for_you', 'config', null, 'Contact fields', 'Name, WhatsApp number, Email, Source, Interest, Owner.', 0.00, 30),
  ('done_for_you', 'config', null, 'WhatsApp templates', 'Welcome, Follow up after 2 days, Appointment reminder.', 0.00, 31),
  ('done_for_you', 'config', null, 'Monthly report', 'New leads by source, conversion rate, WhatsApp conversations used.', 0.00, 32),
  ('done_for_you', 'config', null, 'Automations', 'Follow-up task 2 days after no reply. Move to Lost after 30 days quiet. Notify owner on new lead.', 0.00, 33),
  ('done_for_you', 'config', null, 'Lead scoring', 'Points for source, budget and reply speed. Hot leads shown first.', 0.00, 34),
  ('done_for_you', 'config', null, 'Segments', 'Broadcast lists for new leads, past customers and inactive contacts.', 0.00, 35),
  ('done_for_you', 'config', null, 'AI reply assistant', 'Answers common questions on WhatsApp from the client FAQ and hands over to a person when unsure.', 0.00, 36),
  ('done_for_you', 'config', null, 'Owner reports', 'Weekly pipeline value, team response times, revenue won by source.', 0.00, 37)
) as v(code, kind, stage, title, detail, est_hours, sort)
join public.build_templates t on t.code = v.code
-- Only fill a template that has no lines yet, so edits are never overwritten.
where not exists (select 1 from public.build_template_items i where i.template_id = t.id);

notify pgrst, 'reload schema';

commit;
