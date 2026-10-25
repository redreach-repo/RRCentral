-- Wave 4, PR R: a go live checklist in each build template. A go live step
-- has an owner (Red Reach or the client) and is due a number of days after
-- the client signs. Applying the template copies the steps onto the client
-- (build_tasks, kind golive) with real due dates; the client sees them in the
-- portal. Existing RLS on the three tables covers the new columns.
-- Safe to run more than once.

-- Template lines: a third kind, with owner and days after signing.
alter table public.build_template_items drop constraint if exists build_template_items_kind_check;
alter table public.build_template_items
  add constraint build_template_items_kind_check check (kind in ('task', 'config', 'golive'));
alter table public.build_template_items add column if not exists owner text not null default 'red_reach';
alter table public.build_template_items add column if not exists due_days integer;
alter table public.build_template_items drop constraint if exists build_template_items_owner_check;
alter table public.build_template_items
  add constraint build_template_items_owner_check check (owner in ('red_reach', 'client'));
alter table public.build_template_items drop constraint if exists build_template_items_due_days_check;
alter table public.build_template_items
  add constraint build_template_items_due_days_check check (due_days is null or due_days between 0 and 365);
-- Every checklist and go live step sits in a build stage.
alter table public.build_template_items drop constraint if exists build_template_items_task_stage;
alter table public.build_template_items
  add constraint build_template_items_task_stage check (kind = 'config' or stage is not null);

-- Client steps: which list, who owns it, and when it is due.
alter table public.build_tasks add column if not exists kind text not null default 'task';
alter table public.build_tasks add column if not exists owner text not null default 'red_reach';
alter table public.build_tasks add column if not exists owner_user_id uuid references public.app_users(id) on delete set null;
alter table public.build_tasks add column if not exists due_days integer;
alter table public.build_tasks add column if not exists due_date date;
alter table public.build_tasks drop constraint if exists build_tasks_kind_check;
alter table public.build_tasks add constraint build_tasks_kind_check check (kind in ('task', 'golive'));
alter table public.build_tasks drop constraint if exists build_tasks_owner_check;
alter table public.build_tasks add constraint build_tasks_owner_check check (owner in ('red_reach', 'client'));
alter table public.build_tasks drop constraint if exists build_tasks_due_days_check;
alter table public.build_tasks add constraint build_tasks_due_days_check check (due_days is null or due_days between 0 and 365);
create index if not exists build_tasks_golive_due_idx on public.build_tasks (due_date) where kind = 'golive' and not done;

-- The go live steps for the three starter templates (same lines as
-- defaultGoLive in app/src/lib/goLive.ts). Only added to a template that has
-- no go live steps yet, so edits made on Build templates are kept.
insert into public.build_template_items (template_id, kind, stage, title, detail, est_hours, sort, owner, due_days)
select t.id, 'golive', v.stage, v.title, '', 0, v.sort, v.owner, v.due_days
from (values
  ('starter', 'discovery', 'Kick-off call held and go live date agreed', 'red_reach', 2, 1001),
  ('starter', 'discovery', 'Send logo, brand colours, team list and contacts spreadsheet', 'client', 3, 1002),
  ('starter', 'requirements_signed_off', 'Sign off the starter configuration', 'client', 7, 1003),
  ('starter', 'whatsapp_setup', 'Give access to the WhatsApp Business number and Meta Business account', 'client', 7, 1004),
  ('starter', 'whatsapp_setup', 'WhatsApp templates approved by Meta', 'red_reach', 12, 1005),
  ('starter', 'build', 'CRM ready with contacts imported and team users added', 'red_reach', 14, 1006),
  ('starter', 'testing', 'Team tests with real leads and confirms it works', 'client', 18, 1007),
  ('starter', 'live', 'Training call with the client team', 'red_reach', 20, 1008),
  ('starter', 'live', 'Go live', 'red_reach', 21, 1009),
  ('growth', 'discovery', 'Kick-off call held and go live date agreed', 'red_reach', 2, 1001),
  ('growth', 'discovery', 'Send logo, brand colours, team list and contacts spreadsheet', 'client', 3, 1002),
  ('growth', 'requirements_signed_off', 'Sign off the starter configuration', 'client', 7, 1003),
  ('growth', 'whatsapp_setup', 'Give access to the WhatsApp Business number and Meta Business account', 'client', 7, 1004),
  ('growth', 'build', 'Share access to the website lead form', 'client', 7, 1005),
  ('growth', 'whatsapp_setup', 'WhatsApp templates approved by Meta', 'red_reach', 19, 1006),
  ('growth', 'build', 'CRM ready with contacts imported and team users added', 'red_reach', 21, 1007),
  ('growth', 'testing', 'Team tests with real leads and confirms it works', 'client', 25, 1008),
  ('growth', 'live', 'Training call with the client team', 'red_reach', 27, 1009),
  ('growth', 'live', 'Go live', 'red_reach', 28, 1010),
  ('done_for_you', 'discovery', 'Kick-off call held and go live date agreed', 'red_reach', 2, 1001),
  ('done_for_you', 'discovery', 'Send logo, brand colours, team list and contacts spreadsheet', 'client', 3, 1002),
  ('done_for_you', 'discovery', 'Send the export of the old CRM or spreadsheets', 'client', 5, 1003),
  ('done_for_you', 'requirements_signed_off', 'Sign off the starter configuration', 'client', 7, 1004),
  ('done_for_you', 'whatsapp_setup', 'Give access to the WhatsApp Business number and Meta Business account', 'client', 7, 1005),
  ('done_for_you', 'build', 'Share access to the website lead form', 'client', 7, 1006),
  ('done_for_you', 'whatsapp_setup', 'WhatsApp templates approved by Meta', 'red_reach', 26, 1007),
  ('done_for_you', 'build', 'CRM ready with contacts imported and team users added', 'red_reach', 28, 1008),
  ('done_for_you', 'testing', 'Team tests with real leads and confirms it works', 'client', 32, 1009),
  ('done_for_you', 'build', 'Send the FAQ for the AI reply assistant', 'client', 23, 1010),
  ('done_for_you', 'live', 'Training call with the client team', 'red_reach', 34, 1011),
  ('done_for_you', 'live', 'Go live', 'red_reach', 35, 1012)
) as v(code, stage, title, owner, due_days, sort)
join public.build_templates t on t.code = v.code
where not exists (
  select 1 from public.build_template_items i where i.template_id = t.id and i.kind = 'golive'
);

notify pgrst, 'reload schema';
