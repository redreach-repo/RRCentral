-- RRCRM M2 pipelines/workflows smoke test (run after migrations).
-- Asserts seed pipelines/stages/workflows exist for Red Reach.

do $$
declare
  tid uuid := 'a0000000-0000-4000-8000-000000000001';
  n int;
begin
  select count(*) into n from public.pipelines where tenant_id = tid and active;
  if n < 3 then
    raise exception 'PIPELINES TEST FAILED: expected ≥3 pipelines, got %', n;
  end if;

  select count(*) into n
  from public.pipeline_stages s
  join public.pipelines p on p.id = s.pipeline_id
  where p.tenant_id = tid and p.pipeline_key = 'crm' and s.active;
  if n < 6 then
    raise exception 'PIPELINES TEST FAILED: CRM stages expected ≥6, got %', n;
  end if;

  select count(*) into n
  from public.workflow_definitions
  where tenant_id = tid and workflow_key = 'crm_won_approval';
  if n <> 1 then
    raise exception 'PIPELINES TEST FAILED: crm_won_approval missing';
  end if;

  -- M3 pipeline_deals_v read model exists with expected columns
  if to_regclass('public.pipeline_deals_v') is null then
    raise exception 'PIPELINES TEST FAILED: pipeline_deals_v missing';
  end if;
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'pipeline_deals_v'
    and column_name in ('pipeline', 'deal_id', 'account_id', 'stage', 'tenant_id');
  if n < 5 then
    raise exception 'PIPELINES TEST FAILED: pipeline_deals_v columns incomplete, got %', n;
  end if;

  raise notice 'PIPELINES TEST OK';
end $$;
