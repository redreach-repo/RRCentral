-- Trading division account types (RR Threads, Wanders, …) so uniform / commercial
-- companies are not forced into "AI CRM client".

alter table public.accounts drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (
    type in (
      'rr_threads_client',
      'rr_wanders_client',
      'rr_marketing_client',
      'rr_connect_client',
      'rr_care_client',
      'rr_trading_client',
      'ai_crm_client',
      'worship_church',
      'ctrm_prospect'
    )
  );

-- Support desk SLA policies may also target trading account types.
alter table public.sla_policies drop constraint if exists sla_policies_account_type_check;

alter table public.sla_policies
  add constraint sla_policies_account_type_check
  check (
    account_type is null
    or account_type in (
      'rr_threads_client',
      'rr_wanders_client',
      'rr_marketing_client',
      'rr_connect_client',
      'rr_care_client',
      'rr_trading_client',
      'ai_crm_client',
      'worship_church',
      'ctrm_prospect'
    )
  );

-- Sharjah Ready Mix is an RR Threads (uniforms) client, not AI CRM.
update public.accounts
set
  type = 'rr_threads_client',
  status = case
    when status in ('prospect', 'quoted', 'active', 'paused', 'ended', 'lost') then status
    else 'prospect'
  end,
  updated_at = now()
where lower(name) like '%sharjah ready mix%';
