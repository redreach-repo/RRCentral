-- M10: Fireflies webhook mapping (meeting → account) + ingest audit.

create table if not exists public.fireflies_webhook_maps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  -- Match Fireflies meeting title / organizer email substring (case-insensitive contains).
  match_key text not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, match_key)
);

create index if not exists fireflies_webhook_maps_tenant_idx
  on public.fireflies_webhook_maps (tenant_id, active);

create table if not exists public.fireflies_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  external_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'matched', 'ignored', 'error')),
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists fireflies_webhook_events_ext_idx
  on public.fireflies_webhook_events (external_id, created_at desc);

alter table public.fireflies_webhook_maps enable row level security;
alter table public.fireflies_webhook_events enable row level security;
revoke all on public.fireflies_webhook_maps from anon, authenticated;
revoke all on public.fireflies_webhook_events from anon, authenticated;
grant select, insert, update, delete on public.fireflies_webhook_maps to authenticated;
grant select on public.fireflies_webhook_events to authenticated;

drop policy if exists "Members read fireflies_webhook_maps" on public.fireflies_webhook_maps;
create policy "Members read fireflies_webhook_maps" on public.fireflies_webhook_maps
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write fireflies_webhook_maps" on public.fireflies_webhook_maps;
create policy "Staff write fireflies_webhook_maps" on public.fireflies_webhook_maps
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.fireflies_webhook_maps;
create policy "Tenant isolation" on public.fireflies_webhook_maps
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.fireflies_webhook_maps;
drop policy if exists "Viewers read" on public.fireflies_webhook_maps;

drop policy if exists "Admins read fireflies_webhook_events" on public.fireflies_webhook_events;
create policy "Admins read fireflies_webhook_events" on public.fireflies_webhook_events
  for select to authenticated
  using (public.rr_is_admin() and (tenant_id is null or public.rr_same_tenant(tenant_id)));

comment on table public.fireflies_webhook_maps is 'M10: map Fireflies meeting keys to CRM accounts for webhook ingest.';
comment on table public.fireflies_webhook_events is 'M10: audit of Fireflies webhook deliveries (service role writes).';
