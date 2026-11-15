-- Public API deepen: webhook delivery failure / retry bookkeeping.

alter table public.webhook_endpoints
  add column if not exists delivery_failures integer not null default 0,
  add column if not exists next_retry_at timestamptz;

comment on column public.webhook_endpoints.delivery_failures is
  'Consecutive failed outbound deliveries; reset on success.';
comment on column public.webhook_endpoints.next_retry_at is
  'Earliest time a scheduled retry should run (optional worker).';

create table if not exists public.webhook_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  event_type text not null default 'highmast.test',
  attempt integer not null default 1,
  status text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists webhook_delivery_attempts_endpoint_idx
  on public.webhook_delivery_attempts (endpoint_id, created_at desc);

alter table public.webhook_delivery_attempts enable row level security;

drop policy if exists "Admins manage webhook delivery attempts" on public.webhook_delivery_attempts;
create policy "Admins manage webhook delivery attempts" on public.webhook_delivery_attempts
  for all to authenticated
  using (public.rr_is_admin())
  with check (public.rr_is_admin());

comment on table public.webhook_delivery_attempts is
  'M11: audit log of signed webhook delivery attempts (test + future worker).';
