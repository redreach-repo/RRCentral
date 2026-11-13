-- RRCRM M2 — pipelines and workflows as tenant data
--
-- Stages/colours/outcomes live in pipeline_stages (seeded from today's
-- hardcoded CRM / sales / CTRM boards). Workflow definitions hold triggers
-- + steps (approvals, notify, …); workflow_runs records execution later.
-- Deal tables keep their CHECK constraints for now — CRM company stages are
-- free text, so new CRM stages work immediately from Settings.

------------------------------------------------------------
-- Pipelines + stages
------------------------------------------------------------
create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  pipeline_key text not null,
  name text not null,
  object_type text not null,
  description text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pipeline_key)
);

create index if not exists pipelines_tenant_idx
  on public.pipelines (tenant_id, sort_order);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  stage_key text not null,
  label text not null,
  color text not null default '#64748B',
  outcome text not null default 'open'
    check (outcome in ('open', 'won', 'lost')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pipeline_id, stage_key)
);

create index if not exists pipeline_stages_pipeline_idx
  on public.pipeline_stages (pipeline_id, sort_order);

------------------------------------------------------------
-- Workflows
------------------------------------------------------------
create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  workflow_key text not null,
  name text not null,
  description text not null default '',
  trigger_type text not null default 'manual'
    check (trigger_type in (
      'manual', 'stage_enter', 'record_create', 'field_change'
    )),
  trigger_config jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workflow_key)
);

create index if not exists workflow_definitions_tenant_idx
  on public.workflow_definitions (tenant_id, active);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  definition_id uuid not null references public.workflow_definitions (id) on delete cascade,
  status text not null default 'pending'
    check (status in (
      'pending', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled'
    )),
  context jsonb not null default '{}'::jsonb,
  current_step int not null default 0,
  error_message text not null default '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_runs_definition_idx
  on public.workflow_runs (definition_id, created_at desc);

------------------------------------------------------------
-- Seed Red Reach pipelines (idempotent)
------------------------------------------------------------
do $$
declare
  tid uuid := 'a0000000-0000-4000-8000-000000000001';
  pid uuid;
begin
  -- CRM companies
  insert into public.pipelines (
    tenant_id, pipeline_key, name, object_type, description, sort_order
  ) values (
    tid, 'crm', 'CRM companies', 'crm',
    'Company-level sales pipeline (Lead → Won/Lost).', 10
  )
  on conflict (tenant_id, pipeline_key) do update
    set name = excluded.name,
        object_type = excluded.object_type,
        description = excluded.description,
        sort_order = excluded.sort_order,
        updated_at = now()
  returning id into pid;

  select id into pid from public.pipelines
  where tenant_id = tid and pipeline_key = 'crm';

  insert into public.pipeline_stages (
    tenant_id, pipeline_id, stage_key, label, color, outcome, sort_order
  ) values
    (tid, pid, 'Lead', 'Lead', '#64748B', 'open', 10),
    (tid, pid, 'Contacted', 'Contacted', '#0EA5E9', 'open', 20),
    (tid, pid, 'Quoted', 'Quoted', '#8B5CF6', 'open', 30),
    (tid, pid, 'Negotiation', 'Negotiation', '#F59E0B', 'open', 40),
    (tid, pid, 'Won', 'Won', '#16A34A', 'won', 50),
    (tid, pid, 'Lost', 'Lost', '#DC2626', 'lost', 60)
  on conflict (tenant_id, pipeline_id, stage_key) do nothing;

  -- AI CRM sales deals
  insert into public.pipelines (
    tenant_id, pipeline_key, name, object_type, description, sort_order
  ) values (
    tid, 'sales', 'AI CRM sales', 'sales_deal',
    'Pre-sale package pipeline (lead → signed). Stage keys match sales_deals CHECK.', 20
  )
  on conflict (tenant_id, pipeline_key) do update
    set name = excluded.name,
        object_type = excluded.object_type,
        description = excluded.description,
        sort_order = excluded.sort_order,
        updated_at = now();

  select id into pid from public.pipelines
  where tenant_id = tid and pipeline_key = 'sales';

  insert into public.pipeline_stages (
    tenant_id, pipeline_id, stage_key, label, color, outcome, sort_order
  ) values
    (tid, pid, 'lead', 'Lead', '#64748B', 'open', 10),
    (tid, pid, 'discovery_call', 'Discovery call', '#0EA5E9', 'open', 20),
    (tid, pid, 'quote_sent', 'Quote sent', '#8B5CF6', 'open', 30),
    (tid, pid, 'signed', 'Signed', '#16A34A', 'won', 40),
    (tid, pid, 'lost', 'Lost', '#DC2626', 'lost', 50)
  on conflict (tenant_id, pipeline_id, stage_key) do nothing;

  -- CTRM Next
  insert into public.pipelines (
    tenant_id, pipeline_key, name, object_type, description, sort_order
  ) values (
    tid, 'ctrm', 'CTRM Next', 'ctrm_deal',
    'CTRM partner pipeline. Stage keys match ctrm_deals CHECK.', 30
  )
  on conflict (tenant_id, pipeline_key) do update
    set name = excluded.name,
        object_type = excluded.object_type,
        description = excluded.description,
        sort_order = excluded.sort_order,
        updated_at = now();

  select id into pid from public.pipelines
  where tenant_id = tid and pipeline_key = 'ctrm';

  insert into public.pipeline_stages (
    tenant_id, pipeline_id, stage_key, label, color, outcome, sort_order
  ) values
    (tid, pid, 'identified', 'Identified', '#64748B', 'open', 10),
    (tid, pid, 'contacted', 'Contacted', '#0EA5E9', 'open', 20),
    (tid, pid, 'intro_call_booked', 'Intro call booked', '#06B6D4', 'open', 30),
    (tid, pid, 'demo_done', 'Demo done', '#8B5CF6', 'open', 40),
    (tid, pid, 'evaluating', 'Evaluating', '#F59E0B', 'open', 50),
    (tid, pid, 'decision_pending', 'Decision pending', '#E8872A', 'open', 60),
    (tid, pid, 'signed', 'Signed', '#16A34A', 'won', 70),
    (tid, pid, 'lost', 'Lost', '#DC2626', 'lost', 80)
  on conflict (tenant_id, pipeline_id, stage_key) do nothing;

  -- Sample approval chain (manual / stage_enter on CRM Won)
  insert into public.workflow_definitions (
    tenant_id, workflow_key, name, description, trigger_type, trigger_config, steps, active
  ) values (
    tid,
    'crm_won_approval',
    'CRM won approval',
    'When a CRM company moves to Won, require an admin approval before celebrating.',
    'stage_enter',
    jsonb_build_object(
      'pipeline_key', 'crm',
      'stage_key', 'Won'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'type', 'approval',
        'name', 'Admin confirm',
        'config', jsonb_build_object(
          'approver_role', 'admin',
          'required', true
        )
      ),
      jsonb_build_object(
        'type', 'notify',
        'name', 'Notify owner',
        'config', jsonb_build_object(
          'channel', 'in_app',
          'message', 'Won deal approved'
        )
      )
    ),
    true
  )
  on conflict (tenant_id, workflow_key) do nothing;
end $$;

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.workflow_definitions enable row level security;
alter table public.workflow_runs enable row level security;

drop policy if exists "Members read pipelines" on public.pipelines;
create policy "Members read pipelines" on public.pipelines
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write pipelines" on public.pipelines;
create policy "Admins write pipelines" on public.pipelines
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Members read pipeline stages" on public.pipeline_stages;
create policy "Members read pipeline stages" on public.pipeline_stages
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write pipeline stages" on public.pipeline_stages;
create policy "Admins write pipeline stages" on public.pipeline_stages
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Members read workflows" on public.workflow_definitions;
create policy "Members read workflows" on public.workflow_definitions
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Admins write workflows" on public.workflow_definitions;
create policy "Admins write workflows" on public.workflow_definitions
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Staff read workflow runs" on public.workflow_runs;
create policy "Staff read workflow runs" on public.workflow_runs
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write workflow runs" on public.workflow_runs;
create policy "Staff write workflow runs" on public.workflow_runs
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

do $$
declare
  t text;
begin
  foreach t in array array[
    'pipelines',
    'pipeline_stages',
    'workflow_definitions',
    'workflow_runs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t
    );
  end loop;
end $$;

comment on table public.pipelines is 'RRCRM M2: tenant-defined sales/ops pipelines.';
comment on table public.pipeline_stages is 'RRCRM M2: ordered stages with colour and outcome.';
comment on table public.workflow_definitions is 'RRCRM M2: triggers + steps (approval, notify, …).';
comment on table public.workflow_runs is 'RRCRM M2: workflow execution records.';
