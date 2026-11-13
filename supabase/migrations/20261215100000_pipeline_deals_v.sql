-- M3 slice 5.2: read-only union of CRM / AI CRM sales / CTRM Next deals for reporting.
-- No writes. Relies on underlying table RLS (security_invoker).
-- Does NOT include CTRM commission amounts.

create or replace view public.pipeline_deals_v
with (security_invoker = true)
as
select
  'crm'::text as pipeline,
  c.id as deal_id,
  c.account_id,
  c.company_name as title,
  c.pipeline_stage as stage,
  c.next_action,
  c.follow_up_date as next_action_date,
  null::uuid as owner_user_id,
  nullif(btrim(c.owner), '') as owner_label,
  c.updated_at,
  c.created_at,
  c.tenant_id
from public.crm c

union all

select
  'sales'::text as pipeline,
  s.id as deal_id,
  s.account_id,
  coalesce(nullif(btrim(a.name), ''), 'AI CRM deal') as title,
  s.stage,
  s.next_action,
  s.next_action_date,
  s.owner_user_id,
  null::text as owner_label,
  s.updated_at,
  s.created_at,
  s.tenant_id
from public.sales_deals s
left join public.accounts a on a.id = s.account_id

union all

select
  'ctrm'::text as pipeline,
  d.id as deal_id,
  d.account_id,
  coalesce(nullif(btrim(a.name), ''), 'CTRM deal') as title,
  d.stage,
  d.next_action,
  d.next_action_date,
  d.owner_user_id,
  null::text as owner_label,
  d.updated_at,
  d.created_at,
  d.tenant_id
from public.ctrm_deals d
left join public.accounts a on a.id = d.account_id;

comment on view public.pipeline_deals_v is
  'M3 read model: union of crm, sales_deals, ctrm_deals for reporting. No commission. security_invoker.';

revoke all on public.pipeline_deals_v from anon;
grant select on public.pipeline_deals_v to authenticated;
