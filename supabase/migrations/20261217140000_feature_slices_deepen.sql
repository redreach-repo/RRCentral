-- Deepen M6–M12 first slices: HR bank fields, webhook delivery audit,
-- extra industry packs. Still not finished products / not legal advice.

alter table public.hr_employees
  add column if not exists iban text not null default '',
  add column if not exists allowances_aed numeric(14, 2) not null default 0;

alter table public.webhook_endpoints
  add column if not exists last_delivery_at timestamptz,
  add column if not exists last_delivery_status text not null default '';

insert into public.industry_packs (pack_key, name, description, manifest)
values
  (
    'trading_import',
    'Trading / import',
    'SKU-heavy quoting labels and supplier commitment hints.',
    '{"modules":["sales","ops","finance"],"objects":["product","inventory"]}'::jsonb
  ),
  (
    'events_tours',
    'Events & tours',
    'Wanders-style itinerary and booking money fields.',
    '{"modules":["sales","delivery"],"objects":["deal"]}'::jsonb
  )
on conflict (pack_key) do nothing;

comment on column public.hr_employees.iban is 'Draft WPS IBAN only — validate before live bank files.';
comment on column public.webhook_endpoints.last_delivery_at is 'Last outbound test/event attempt.';
