-- Gap plan module 2: Public REST API keys + outbound webhooks
-- (docs/MODULE_BUILD_PLAN.md, docs/modules/public-api.md).
--
-- * api_keys: only a SHA-256 hash is stored; the key is shown once by
--   rr_api_key_create(). The Edge Function hm-public-api looks keys up by hash.
-- * webhook_endpoints: per tenant URL + event filter + signing secret. The
--   secret column is NOT readable by app users (column grants); only the
--   service role (hm-webhook-dispatch) reads it. It is returned once on create.
-- * webhook_deliveries: one row per endpoint per event, filled by a trigger
--   on event_outbox, sent and retried by hm-webhook-dispatch.
-- Built-ins only (gen_random_uuid, sha256); no pgcrypto. Safe to re-run.

begin;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  key_prefix text not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{}',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint api_keys_scopes_known check (
    scopes <@ array['accounts:read', 'invoices:read', 'quotations:read']::text[]
  )
);

create index if not exists api_keys_tenant_idx on public.api_keys (tenant_id, created_at desc);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  url text not null check (url ~ '^https://[^\s/]+'),
  description text not null default '',
  -- Event types from event_outbox.event_type, or '*' for every event.
  events text[] not null default array['*']::text[],
  secret text not null,
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_endpoints_tenant_idx on public.webhook_endpoints (tenant_id) where active;

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  event_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'succeeded', 'failed', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status_code int,
  last_error text not null default '',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint_id, event_id)
);

create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at) where status in ('pending', 'failed');
create index if not exists webhook_deliveries_endpoint_idx
  on public.webhook_deliveries (endpoint_id, created_at desc);

------------------------------------------------------------
-- Audit redaction: never copy webhook secrets or key hashes into audit_log.
-- Same rules as 20260926080000_audit_log.sql, plus the two columns.
------------------------------------------------------------
create or replace function public.rr_audit_redact(tbl text, data jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when data is null then null
    when tbl = 'app_settings'
      and (data->>'key' ilike '%secret%' or data->>'key' ilike '%token%'
           or data->>'key' ilike '%password%' or data->>'key' ilike '%apikey%')
      then jsonb_set(data, '{value}', '"[redacted]"')
    when data ? 'secret' or data ? 'key_hash'
      then (data - 'secret' - 'key_hash')
        || case when data ? 'secret' then '{"secret":"[redacted]"}'::jsonb else '{}'::jsonb end
        || case when data ? 'key_hash' then '{"key_hash":"[redacted]"}'::jsonb else '{}'::jsonb end
    else data
  end
$$;

------------------------------------------------------------
-- Functions (admin only)
------------------------------------------------------------
create or replace function public.rr_random_token(p_prefix text)
returns text
language sql
volatile
set search_path = public
as $$
  -- Two v4 UUIDs = 244 random bits from the server CSPRNG.
  select p_prefix || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

create or replace function public.rr_sha256_hex(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

-- Returns the plain key ONCE. Only the hash is kept.
create or replace function public.rr_api_key_create(
  p_name text,
  p_scopes text[],
  p_expires_at timestamptz default null
)
returns table (id uuid, api_key text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  k text := public.rr_random_token('hm_');
  new_id uuid;
begin
  if not public.rr_is_admin() then
    raise exception 'Only an admin can create API keys' using errcode = '42501';
  end if;
  if coalesce(array_length(p_scopes, 1), 0) = 0 then
    raise exception 'Pick at least one scope' using errcode = '22023';
  end if;
  insert into public.api_keys (tenant_id, name, key_prefix, key_hash, scopes, created_by, expires_at)
  values (
    public.rr_my_tenant_id(), btrim(p_name), left(k, 11), public.rr_sha256_hex(k),
    p_scopes, coalesce(public.rr_current_email(), ''), p_expires_at
  )
  returning api_keys.id into new_id;
  return query select new_id, k;
end;
$$;

create or replace function public.rr_api_key_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.rr_is_admin() then
    raise exception 'Only an admin can revoke API keys' using errcode = '42501';
  end if;
  update public.api_keys set revoked_at = coalesce(revoked_at, now())
  where id = p_id and tenant_id = public.rr_my_tenant_id();
  if not found then
    raise exception 'API key not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Returns the signing secret ONCE.
create or replace function public.rr_webhook_endpoint_create(
  p_url text,
  p_events text[] default array['*']::text[],
  p_description text default ''
)
returns table (id uuid, signing_secret text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  s text := public.rr_random_token('whsec_');
  new_id uuid;
begin
  if not public.rr_is_admin() then
    raise exception 'Only an admin can add webhooks' using errcode = '42501';
  end if;
  insert into public.webhook_endpoints (tenant_id, url, events, description, secret, created_by)
  values (
    public.rr_my_tenant_id(), btrim(p_url), coalesce(p_events, array['*']::text[]),
    coalesce(p_description, ''), s, coalesce(public.rr_current_email(), '')
  )
  returning webhook_endpoints.id into new_id;
  return query select new_id, s;
end;
$$;

-- Fan out each new outbox event to matching active endpoints of its tenant.
create or replace function public.rr_webhook_fanout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_deliveries (tenant_id, endpoint_id, event_id, event_type, payload)
  select e.tenant_id, e.id, new.id, new.event_type,
         jsonb_build_object(
           'id', new.id,
           'type', new.event_type,
           'aggregate_type', new.aggregate_type,
           'aggregate_id', new.aggregate_id,
           'created_at', new.created_at,
           'data', new.payload
         )
  from public.webhook_endpoints e
  where e.tenant_id = new.tenant_id
    and e.active
    and ('*' = any (e.events) or new.event_type = any (e.events))
  on conflict (endpoint_id, event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists rr_webhook_fanout on public.event_outbox;
create trigger rr_webhook_fanout
  after insert on public.event_outbox
  for each row execute function public.rr_webhook_fanout();

-- Worker side (service role only): claim due deliveries with their endpoint
-- URL and secret, then record each result with exponential backoff.
create or replace function public.rr_claim_webhook_deliveries(p_limit int default 25)
returns table (
  id uuid, endpoint_id uuid, url text, secret text, event_type text,
  payload jsonb, attempts int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A worker that died mid-send leaves rows in 'sending'; retry them after 10 minutes.
  update public.webhook_deliveries d
     set status = 'failed', last_error = 'worker timed out'
   where d.status = 'sending' and d.next_attempt_at < now() - interval '10 minutes';

  return query
  with due as (
    select d.id from public.webhook_deliveries d
    join public.webhook_endpoints e on e.id = d.endpoint_id and e.active
    where d.status in ('pending', 'failed') and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update of d skip locked
  ), claimed as (
    update public.webhook_deliveries d
       set status = 'sending', next_attempt_at = now()
      from due where d.id = due.id
    returning d.id, d.endpoint_id, d.event_type, d.payload, d.attempts
  )
  select c.id, c.endpoint_id, e.url, e.secret, c.event_type, c.payload, c.attempts
  from claimed c join public.webhook_endpoints e on e.id = c.endpoint_id;
end;
$$;

create or replace function public.rr_webhook_delivery_result(
  p_id uuid, p_ok boolean, p_status_code int default null, p_error text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  new_status text;
begin
  update public.webhook_deliveries
     set attempts = attempts + 1
   where id = p_id and status = 'sending'
  returning attempts into n;
  if n is null then
    return 'not_sending';
  end if;
  new_status := case when p_ok then 'succeeded' when n >= 8 then 'dead' else 'failed' end;
  update public.webhook_deliveries
     set status = new_status,
         last_status_code = p_status_code,
         last_error = left(coalesce(p_error, ''), 500),
         delivered_at = case when p_ok then now() else null end,
         -- 1, 2, 4, 8 ... minutes, capped at one hour.
         next_attempt_at = case when p_ok then next_attempt_at
           else now() + least(interval '1 hour', interval '1 minute' * power(2, n - 1)) end
   where id = p_id;
  return new_status;
end;
$$;

revoke all on function public.rr_claim_webhook_deliveries(int) from public, anon, authenticated;
revoke all on function public.rr_webhook_delivery_result(uuid, boolean, int, text) from public, anon, authenticated;
grant execute on function public.rr_claim_webhook_deliveries(int) to service_role;
grant execute on function public.rr_webhook_delivery_result(uuid, boolean, int, text) to service_role;

revoke all on function public.rr_random_token(text) from public;
revoke all on function public.rr_api_key_create(text, text[], timestamptz) from public;
revoke all on function public.rr_api_key_revoke(uuid) from public;
revoke all on function public.rr_webhook_endpoint_create(text, text[], text) from public;
revoke all on function public.rr_webhook_fanout() from public;
grant execute on function public.rr_api_key_create(text, text[], timestamptz) to authenticated;
grant execute on function public.rr_api_key_revoke(uuid) to authenticated;
grant execute on function public.rr_webhook_endpoint_create(text, text[], text) to authenticated;

------------------------------------------------------------
-- Grants + RLS
------------------------------------------------------------
alter table public.api_keys enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;

revoke all on public.api_keys from anon, authenticated;
revoke all on public.webhook_endpoints from anon, authenticated;
revoke all on public.webhook_deliveries from anon, authenticated;

-- Keys: admins read metadata (never the plain key, which is not stored). Writes via functions.
grant select (id, tenant_id, name, key_prefix, scopes, created_by, created_at, expires_at, last_used_at, revoked_at)
  on public.api_keys to authenticated;
-- Endpoints: everything except the secret; admins can change url/events/active.
grant select (id, tenant_id, url, description, events, active, created_by, created_at, updated_at)
  on public.webhook_endpoints to authenticated;
grant update (url, description, events, active, updated_at) on public.webhook_endpoints to authenticated;
grant delete on public.webhook_endpoints to authenticated;
grant select on public.webhook_deliveries to authenticated;

drop policy if exists "Admins read api keys" on public.api_keys;
create policy "Admins read api keys" on public.api_keys
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Admins manage webhooks" on public.webhook_endpoints;
create policy "Admins manage webhooks" on public.webhook_endpoints
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Admins read webhook deliveries" on public.webhook_deliveries;
create policy "Admins read webhook deliveries" on public.webhook_deliveries
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

do $$
declare
  t text;
begin
  foreach t in array array['api_keys', 'webhook_endpoints', 'webhook_deliveries']
  loop
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t
    );
  end loop;
  foreach t in array array['api_keys', 'webhook_endpoints']
  loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()',
      t
    );
  end loop;
end $$;

comment on table public.api_keys is 'Gap plan public API: hashed keys (hm_...), scopes, revoke. Plain key never stored.';
comment on table public.webhook_endpoints is 'Gap plan webhooks: per tenant URL + events; secret readable by service role only.';
comment on table public.webhook_deliveries is 'Gap plan webhooks: fan out from event_outbox; sent by hm-webhook-dispatch.';

notify pgrst, 'reload schema';

commit;
