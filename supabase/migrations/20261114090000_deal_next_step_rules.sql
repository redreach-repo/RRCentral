-- RR Central Wave 3, PR I: every deal move needs a next step, and Lost needs a reason.
--
-- On the original CRM, AI CRM sales and CTRM Next:
--   * moving a deal into an open stage needs a next action and its date;
--   * moving it to Lost needs a reason from a short list plus a note.
-- The app checks this first; the trigger below makes sure no screen or
-- script can skip it. It only runs when the stage changes, so older deals
-- without a next step can still be edited (the dashboard lists them under
-- "No next step") and new leads can be added without one.
--
-- New columns: sales_deals.lost_reason_code and ctrm_deals.lost_reason_code
-- (the list value; lost_reason stays as the note), crm.lost_note (the CRM
-- already keeps its list value in outcome_reason). No new tables, so row
-- level security is unchanged. Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop trigger if exists rr_deal_stage_rules on public.crm;
--   drop trigger if exists rr_deal_stage_rules on public.sales_deals;
--   drop trigger if exists rr_deal_stage_rules on public.ctrm_deals;
--   drop function if exists public.rr_deal_stage_rules();
--   alter table public.sales_deals drop column if exists lost_reason_code;
--   alter table public.ctrm_deals drop column if exists lost_reason_code;
--   alter table public.crm drop column if exists lost_note;

alter table public.sales_deals add column if not exists lost_reason_code text not null default '';
alter table public.ctrm_deals add column if not exists lost_reason_code text not null default '';
alter table public.crm add column if not exists lost_note text not null default '';

-- Arguments: stage column, next action column, date column, reason column, note column.
-- Same list as LOST_REASONS in app/src/lib/dealRules.ts.
create or replace function public.rr_deal_stage_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n jsonb := to_jsonb(new);
  stage text := n ->> tg_argv[0];
begin
  if stage is not distinct from (to_jsonb(old) ->> tg_argv[0]) then
    return new;
  end if;
  if stage in ('Lost', 'lost') then
    if coalesce(n ->> tg_argv[3], '') not in
       ('Price', 'Competitor won', 'Timing / budget', 'Scope mismatch', 'No response', 'Relationship', 'Other') then
      raise exception 'Pick why the deal was lost' using errcode = 'check_violation';
    end if;
    if btrim(coalesce(n ->> tg_argv[4], '')) = '' then
      raise exception 'Add a note on why the deal was lost' using errcode = 'check_violation';
    end if;
  elsif stage not in ('Won', 'signed') then
    if btrim(coalesce(n ->> tg_argv[1], '')) = '' then
      raise exception 'Every open deal needs a next action' using errcode = 'check_violation';
    end if;
    if coalesce(n ->> tg_argv[2], '') = '' then
      raise exception 'Give the next action a date' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rr_deal_stage_rules on public.crm;
create trigger rr_deal_stage_rules before update on public.crm
  for each row execute function public.rr_deal_stage_rules('pipeline_stage', 'next_action', 'follow_up_date', 'outcome_reason', 'lost_note');

drop trigger if exists rr_deal_stage_rules on public.sales_deals;
create trigger rr_deal_stage_rules before update on public.sales_deals
  for each row execute function public.rr_deal_stage_rules('stage', 'next_action', 'next_action_date', 'lost_reason_code', 'lost_reason');

drop trigger if exists rr_deal_stage_rules on public.ctrm_deals;
create trigger rr_deal_stage_rules before update on public.ctrm_deals
  for each row execute function public.rr_deal_stage_rules('stage', 'next_action', 'next_action_date', 'lost_reason_code', 'lost_reason');

notify pgrst, 'reload schema';
