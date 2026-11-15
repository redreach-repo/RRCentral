-- M13: shared rate-limit counters for Edge Functions (service role).

create table if not exists public.rate_limit_buckets (
  id uuid primary key default gen_random_uuid(),
  bucket_key text not null,
  window_start timestamptz not null,
  hit_count int not null default 0 check (hit_count >= 0),
  created_at timestamptz not null default now(),
  unique (bucket_key, window_start)
);

create index if not exists rate_limit_buckets_window_idx
  on public.rate_limit_buckets (window_start);

-- Atomic hit: returns true when under limit after increment.
create or replace function public.rr_rate_limit_hit(
  p_key text,
  p_limit int,
  p_window_seconds int default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  cnt int;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'bucket key required';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'limit must be >= 1';
  end if;
  w_start := to_timestamp(
    floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1)
  );

  insert into public.rate_limit_buckets (bucket_key, window_start, hit_count)
  values (p_key, w_start, 1)
  on conflict (bucket_key, window_start)
  do update set hit_count = public.rate_limit_buckets.hit_count + 1
  returning hit_count into cnt;

  return cnt <= p_limit;
end;
$$;

revoke all on function public.rr_rate_limit_hit(text, int, int) from public;
-- Service role / Edge use this; authenticated apps should not call freely.
grant execute on function public.rr_rate_limit_hit(text, int, int) to service_role;

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;
-- No policies for authenticated → deny; service role bypasses RLS.

comment on table public.rate_limit_buckets is 'M13: Edge rate-limit windows; service_role only.';
comment on function public.rr_rate_limit_hit(text, int, int) is 'M13: increment bucket; true if still within limit.';
