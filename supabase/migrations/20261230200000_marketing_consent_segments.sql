-- M10 deepen: marketing consent on contacts, segments, campaign recipients.

alter table public.account_contacts
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_source text not null default '';

create table if not exists public.marketing_segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  name text not null,
  description text not null default '',
  -- JSON filter hints (e.g. {"opt_in_only": true, "channel": "email"}) — not a query engine.
  filter_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists marketing_segments_tenant_idx
  on public.marketing_segments (tenant_id);

create table if not exists public.marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  campaign_id uuid not null references public.marketing_campaigns (id) on delete cascade,
  contact_id uuid not null references public.account_contacts (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'drafted', 'sent', 'skipped', 'bounced')),
  skip_reason text not null default '',
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists marketing_campaign_recipients_campaign_idx
  on public.marketing_campaign_recipients (campaign_id, status);

alter table public.marketing_segments enable row level security;
alter table public.marketing_campaign_recipients enable row level security;
revoke all on public.marketing_segments from anon, authenticated;
revoke all on public.marketing_campaign_recipients from anon, authenticated;
grant select, insert, update, delete on public.marketing_segments to authenticated;
grant select, insert, update, delete on public.marketing_campaign_recipients to authenticated;

do $$
declare t text;
begin
  foreach t in array array['marketing_segments', 'marketing_campaign_recipients']
  loop
    execute format('drop policy if exists %I on public.%I', 'Members read ' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff write ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
         with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Staff write ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t);
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
  end loop;
end $$;

comment on table public.marketing_segments is 'M10: named audience segments (filter hints only).';
comment on table public.marketing_campaign_recipients is 'M10: per-campaign recipient queue; no live ESP send.';
comment on column public.account_contacts.marketing_opt_in is 'M10: explicit marketing consent; default false.';
