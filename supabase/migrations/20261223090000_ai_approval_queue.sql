-- AI approval queue (gap plan module, docs/modules/ai-approval-queue.md).
--
-- AI never writes CRM data. The hm-ai-propose Edge Function asks Claude for
-- suggested actions on one account and stores them here as PENDING proposals,
-- with the prompt, model and cost. A person then approves (as is or edited)
-- or rejects each one. Approving runs the action through
-- rr_ai_proposal_decide(), which is SECURITY INVOKER: the write happens as the
-- approving user, under that user's own row level security.
--
-- Actions (an allow list; anything else is refused):
--   add_timeline_note      insert one account_activities row (note/call/email/meeting)
--   update_account_fields  change industry / country / city / website / notes on the account
--
-- Rules
--   * Nobody updates a proposal row directly (no UPDATE policy). Decisions go
--     through rr_ai_proposal_decide / rr_ai_proposal_record.
--   * rr_ai_proposal_record (SECURITY DEFINER) only marks a proposal executed
--     when the data really shows the action: the timeline row exists with this
--     proposal's id, or the account fields equal the approved values.
--   * Setting ai.approvals.require_manager = 'true' (app_settings) limits
--     approving to managers and admins.
--   * Decisions are final. Audited through rr_audit_trigger.
--
-- Safe to re-run.

create table if not exists public.ai_action_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid references public.tenants(id),
  account_id uuid not null references public.accounts(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  original_payload jsonb,
  summary text not null default '',
  rationale text not null default '',
  prompt text not null default '',
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  status text not null default 'pending',
  proposed_by uuid references public.app_users(id) on delete set null,
  proposed_by_email text not null default '',
  decided_by uuid references public.app_users(id) on delete set null,
  decided_by_email text not null default '',
  decided_at timestamptz,
  decision_note text not null default '',
  result jsonb,
  error text not null default '',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_action_proposals_action_check') then
    alter table public.ai_action_proposals add constraint ai_action_proposals_action_check
      check (action in ('add_timeline_note', 'update_account_fields'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_action_proposals_status_check') then
    alter table public.ai_action_proposals add constraint ai_action_proposals_status_check
      check (status in ('pending', 'executed', 'rejected', 'cancelled', 'failed'));
  end if;
end $$;

create index if not exists ai_action_proposals_queue_idx
  on public.ai_action_proposals (tenant_id, status, created_at desc);
create index if not exists ai_action_proposals_account_idx
  on public.ai_action_proposals (account_id, created_at desc);

-- Cost of the proposing call is logged in ai_usage_log too, so it counts in
-- the client's profitability. Keep every earlier feature name.
alter table public.ai_usage_log drop constraint if exists ai_usage_log_feature_check;
alter table public.ai_usage_log
  add constraint ai_usage_log_feature_check
  check (feature in (
    'ticket_summary', 'ticket_reply', 'report_summary', 'call_notes',
    'call_brief', 'update_tidy', 'crm_ask', 'ai_propose'
  ));

-- Returns '' when the payload is acceptable for the action, else the reason.
create or replace function public.rr_ai_proposal_payload_problem(p_action text, p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'payload must be an object';
  end if;
  if p_action = 'add_timeline_note' then
    for k in select jsonb_object_keys(p_payload) loop
      if k not in ('kind', 'body') then return 'unknown field ' || k; end if;
    end loop;
    if coalesce(p_payload->>'kind', '') not in ('note', 'call', 'email', 'meeting') then
      return 'kind must be note, call, email or meeting';
    end if;
    if jsonb_typeof(p_payload->'body') is distinct from 'string' or btrim(p_payload->>'body') = '' then
      return 'body is required';
    end if;
    if length(p_payload->>'body') > 4000 then return 'body is longer than 4000 characters'; end if;
    return '';
  elsif p_action = 'update_account_fields' then
    if p_payload = '{}'::jsonb then return 'no fields to change'; end if;
    for k, v in select * from jsonb_each(p_payload) loop
      if k not in ('industry', 'country', 'city', 'website', 'notes') then
        return 'field ' || k || ' cannot be changed by an AI proposal';
      end if;
      if jsonb_typeof(v) <> 'string' then return k || ' must be text'; end if;
      if length(v #>> '{}') > 2000 then return k || ' is longer than 2000 characters'; end if;
    end loop;
    return '';
  end if;
  return 'unknown action ' || coalesce(p_action, '(none)');
end $$;

-- New proposals: always pending, stamped with the signed in proposer and the
-- account's tenant; decision fields cannot be pre-filled.
create or replace function public.rr_ai_proposal_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  problem text;
  acct_tenant uuid;
begin
  problem := public.rr_ai_proposal_payload_problem(new.action, new.payload);
  if problem <> '' then
    raise exception 'AI proposal refused: %', problem using errcode = '22023';
  end if;
  select tenant_id into acct_tenant from public.accounts where id = new.account_id;
  new.tenant_id := coalesce(acct_tenant, new.tenant_id);
  new.status := 'pending';
  new.original_payload := null;
  new.decided_by := null;
  new.decided_by_email := '';
  new.decided_at := null;
  new.decision_note := '';
  new.result := null;
  new.error := '';
  new.created_at := now();
  if auth.uid() is not null then
    new.proposed_by := public.rr_current_user_id();
    new.proposed_by_email := coalesce(public.rr_current_email(), '');
  end if;
  return new;
end $$;

drop trigger if exists rr_ai_proposal_before_insert on public.ai_action_proposals;
create trigger rr_ai_proposal_before_insert
  before insert on public.ai_action_proposals
  for each row execute function public.rr_ai_proposal_before_insert();

-- Belt and braces: the what/who/when of a proposal never changes after insert,
-- and a decided proposal is final, even for the table owner's functions.
create or replace function public.rr_ai_proposal_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'This AI proposal is already %', old.status using errcode = '42501';
  end if;
  if new.id <> old.id or new.tenant_id <> old.tenant_id or new.account_id <> old.account_id
     or new.action <> old.action or new.prompt <> old.prompt or new.model <> old.model
     or new.proposed_by is distinct from old.proposed_by or new.created_at <> old.created_at then
    raise exception 'AI proposal details cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists rr_ai_proposal_before_update on public.ai_action_proposals;
create trigger rr_ai_proposal_before_update
  before update on public.ai_action_proposals
  for each row execute function public.rr_ai_proposal_before_update();

-- Who may approve (execute) a proposal on this account.
create or replace function public.rr_ai_can_approve(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.rr_can_write_account(p_account)
    and exists (select 1 from public.accounts a where a.id = p_account and public.rr_same_tenant(a.tenant_id))
    and (
      coalesce((select value from public.app_settings where key = 'ai.approvals.require_manager'), '') <> 'true'
      or public.rr_is_manager_or_admin()
    )
$$;

-- Records a decision. SECURITY DEFINER because nobody may update the table
-- directly; every path checks the caller and, for 'executed', checks the
-- data really shows the approved action.
create or replace function public.rr_ai_proposal_record(
  p_id uuid,
  p_status text,
  p_payload jsonb default null,
  p_result jsonb default null,
  p_note text default '',
  p_error text default ''
)
returns public.ai_action_proposals
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  p public.ai_action_proposals;
  me uuid := public.rr_current_user_id();
  final_payload jsonb;
  k text;
  v jsonb;
  ok boolean;
begin
  if auth.uid() is null or me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into p from public.ai_action_proposals where id = p_id for update;
  if not found or not public.rr_same_tenant(p.tenant_id) then
    raise exception 'AI proposal not found' using errcode = 'P0002';
  end if;
  if p.status <> 'pending' then
    raise exception 'This AI proposal is already %', p.status using errcode = '42501';
  end if;
  final_payload := coalesce(p_payload, p.payload);

  if p_status = 'cancelled' then
    if p.proposed_by is distinct from me then
      raise exception 'Only the person who asked for this proposal can cancel it' using errcode = '42501';
    end if;
  elsif p_status = 'rejected' then
    if p.proposed_by is distinct from me and not public.rr_ai_can_approve(p.account_id) then
      raise exception 'You cannot decide on proposals for this account' using errcode = '42501';
    end if;
  elsif p_status in ('executed', 'failed') then
    if not public.rr_ai_can_approve(p.account_id) then
      raise exception 'You cannot approve proposals for this account' using errcode = '42501';
    end if;
    if public.rr_ai_proposal_payload_problem(p.action, final_payload) <> '' then
      raise exception 'AI proposal refused: %', public.rr_ai_proposal_payload_problem(p.action, final_payload)
        using errcode = '22023';
    end if;
    if p_status = 'executed' then
      if p.action = 'add_timeline_note' then
        select exists (
          select 1 from public.account_activities a
          where a.account_id = p.account_id and a.external_source = 'ai_proposal'
            and a.external_id = p.id::text and a.user_id = me
            and a.kind = final_payload->>'kind' and a.body = final_payload->>'body'
        ) into ok;
      else
        ok := true;
        for k, v in select * from jsonb_each(final_payload) loop
          execute format('select coalesce((select %I = $1 from public.accounts where id = $2), false)', k)
            into ok using v #>> '{}', p.account_id;
          exit when not ok;
        end loop;
      end if;
      if not ok then
        raise exception 'The approved change is not in the data, so it cannot be marked done' using errcode = '42501';
      end if;
    end if;
  else
    raise exception 'Unknown decision %', p_status using errcode = '22023';
  end if;

  update public.ai_action_proposals
     set status = p_status,
         original_payload = case when final_payload is distinct from p.payload then p.payload else null end,
         payload = final_payload,
         decided_by = me,
         decided_by_email = coalesce(public.rr_current_email(), ''),
         decided_at = now(),
         decision_note = left(coalesce(p_note, ''), 1000),
         result = p_result,
         error = left(coalesce(p_error, ''), 1000)
   where id = p_id
  returning * into p;
  return p;
end $$;

-- The one way to act on a proposal. SECURITY INVOKER: an approved action is
-- written as the approving user, so their own row level security applies.
--   p_decision: 'approve' | 'reject' | 'cancel'
--   p_payload:  edited payload for 'approve' (null = as proposed)
create or replace function public.rr_ai_proposal_decide(
  p_id uuid,
  p_decision text,
  p_payload jsonb default null,
  p_note text default ''
)
returns public.ai_action_proposals
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  p public.ai_action_proposals;
  final_payload jsonb;
  problem text;
  new_id uuid;
  n integer;
begin
  select * into p from public.ai_action_proposals where id = p_id;
  if not found then
    raise exception 'AI proposal not found' using errcode = 'P0002';
  end if;
  if p.status <> 'pending' then
    raise exception 'This AI proposal is already %', p.status using errcode = '42501';
  end if;

  if p_decision = 'reject' then
    return public.rr_ai_proposal_record(p_id, 'rejected', null, null, p_note, '');
  elsif p_decision = 'cancel' then
    return public.rr_ai_proposal_record(p_id, 'cancelled', null, null, p_note, '');
  elsif p_decision <> 'approve' then
    raise exception 'Unknown decision %', p_decision using errcode = '22023';
  end if;

  if not public.rr_ai_can_approve(p.account_id) then
    raise exception 'You cannot approve proposals for this account' using errcode = '42501';
  end if;
  final_payload := coalesce(p_payload, p.payload);
  problem := public.rr_ai_proposal_payload_problem(p.action, final_payload);
  if problem <> '' then
    raise exception 'AI proposal refused: %', problem using errcode = '22023';
  end if;

  begin
    if p.action = 'add_timeline_note' then
      insert into public.account_activities (account_id, user_id, user_email, kind, body, external_source, external_id)
      values (p.account_id, public.rr_current_user_id(), coalesce(public.rr_current_email(), ''),
              final_payload->>'kind', final_payload->>'body', 'ai_proposal', p.id::text)
      returning id into new_id;
      return public.rr_ai_proposal_record(p_id, 'executed', final_payload,
        jsonb_build_object('account_activity_id', new_id), p_note, '');
    else
      update public.accounts a
         set industry = coalesce(final_payload->>'industry', a.industry),
             country  = coalesce(final_payload->>'country', a.country),
             city     = coalesce(final_payload->>'city', a.city),
             website  = coalesce(final_payload->>'website', a.website),
             notes    = coalesce(final_payload->>'notes', a.notes),
             updated_at = now()
       where a.id = p.account_id;
      get diagnostics n = row_count;
      if n = 0 then
        raise exception 'You cannot edit this account' using errcode = '42501';
      end if;
      return public.rr_ai_proposal_record(p_id, 'executed', final_payload,
        jsonb_build_object('account_id', p.account_id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(final_payload) k)),
        p_note, '');
    end if;
  exception
    when insufficient_privilege then
      raise;
    when others then
      -- The write failed for a data reason (constraint, missing row): keep the
      -- reason on the proposal instead of losing it.
      return public.rr_ai_proposal_record(p_id, 'failed', final_payload, null, p_note, sqlerrm);
  end;
end $$;

revoke all on function public.rr_ai_proposal_record(uuid, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.rr_ai_proposal_record(uuid, text, jsonb, jsonb, text, text) to authenticated;
revoke all on function public.rr_ai_proposal_decide(uuid, text, jsonb, text) from public, anon;
grant execute on function public.rr_ai_proposal_decide(uuid, text, jsonb, text) to authenticated;
grant execute on function public.rr_ai_proposal_payload_problem(text, jsonb) to authenticated;
grant execute on function public.rr_ai_can_approve(uuid) to authenticated;

-- Row level security
alter table public.ai_action_proposals enable row level security;
grant select, insert, delete on public.ai_action_proposals to authenticated;
revoke update on public.ai_action_proposals from authenticated, anon;

do $$
declare pol record;
begin
  for pol in select polname from pg_policy where polrelid = 'public.ai_action_proposals'::regclass loop
    execute format('drop policy if exists %I on public.ai_action_proposals', pol.polname);
  end loop;
end $$;

create policy "Proposer or account editors read" on public.ai_action_proposals
  for select to authenticated
  using (proposed_by = public.rr_current_user_id() or public.rr_can_write_account(account_id));
create policy "Account editors propose" on public.ai_action_proposals
  for insert to authenticated
  with check (public.rr_can_write_account(account_id));
create policy "Admins delete" on public.ai_action_proposals
  for delete to authenticated
  using (public.rr_is_admin());
create policy "Tenant isolation" on public.ai_action_proposals
  as restrictive to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop trigger if exists rr_audit on public.ai_action_proposals;
create trigger rr_audit after insert or update or delete on public.ai_action_proposals
  for each row execute function public.rr_audit_trigger();
