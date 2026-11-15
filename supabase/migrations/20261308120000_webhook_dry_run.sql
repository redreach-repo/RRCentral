-- Optional dry_run flag on webhook endpoints (demo / no outbound).

alter table public.webhook_endpoints
  add column if not exists dry_run boolean not null default false;

comment on column public.webhook_endpoints.dry_run is
  'When true, public-api logs delivery as dry_run and does not POST. Demo env also skips outbound.';
