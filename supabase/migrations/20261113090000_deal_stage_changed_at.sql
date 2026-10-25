-- RR Central Wave 3, PR H: when each deal reached its stage.
--
-- My deals shows "days in stage" for the original CRM, AI CRM sales and
-- CTRM Next deals. stage_changed_at is set by the database whenever the stage
-- changes (pipeline_stage on crm, stage on the other two), so it is right
-- whichever screen moved the deal. It cannot be set by hand.
--
-- Old rows keep it empty; the app then falls back to what it already knows
-- (CRM: last update, AI CRM sales: quote sent or signed date, CTRM Next: the
-- stage history). No new tables, so row level security is unchanged.
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop trigger if exists rr_stage_changed_at on public.crm;
--   drop trigger if exists rr_stage_changed_at on public.sales_deals;
--   drop trigger if exists rr_stage_changed_at on public.ctrm_deals;
--   drop function if exists public.rr_stage_changed_at();
--   alter table public.crm drop column if exists stage_changed_at;
--   alter table public.sales_deals drop column if exists stage_changed_at;
--   alter table public.ctrm_deals drop column if exists stage_changed_at;

alter table public.crm add column if not exists stage_changed_at timestamptz;
alter table public.sales_deals add column if not exists stage_changed_at timestamptz;
alter table public.ctrm_deals add column if not exists stage_changed_at timestamptz;

-- The stage column's name is the trigger's argument.
create or replace function public.rr_stage_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  col text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    new.stage_changed_at := now();
  elsif (to_jsonb(new) ->> col) is distinct from (to_jsonb(old) ->> col) then
    new.stage_changed_at := now();
  else
    new.stage_changed_at := old.stage_changed_at;
  end if;
  return new;
end $$;

drop trigger if exists rr_stage_changed_at on public.crm;
create trigger rr_stage_changed_at before insert or update on public.crm
  for each row execute function public.rr_stage_changed_at('pipeline_stage');

drop trigger if exists rr_stage_changed_at on public.sales_deals;
create trigger rr_stage_changed_at before insert or update on public.sales_deals
  for each row execute function public.rr_stage_changed_at('stage');

drop trigger if exists rr_stage_changed_at on public.ctrm_deals;
create trigger rr_stage_changed_at before insert or update on public.ctrm_deals
  for each row execute function public.rr_stage_changed_at('stage');

notify pgrst, 'reload schema';
