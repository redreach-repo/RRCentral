-- Master Spec v2.1 §11.3 / §11.4 starter catalog rows (full packs later).
insert into public.industry_packs (pack_key, name, description, version, manifest, active)
values
  (
    'engineering',
    'Engineering',
    'Master Spec §11.3 starter: projects, claims, document registers (full pack later).',
    '0.1.0',
    '{"modules":["sales","delivery","ops","finance"],"objects":["deal","project"]}'::jsonb,
    true
  ),
  (
    'construction',
    'Construction',
    'Master Spec §11.4 starter: sites, workforce, materials (full pack later).',
    '0.1.0',
    '{"modules":["sales","delivery","ops","finance","hr"],"objects":["deal","project"]}'::jsonb,
    true
  ),
  (
    'trading_import',
    'Trading / import',
    'SKU-heavy quoting labels and supplier commitment hints.',
    '0.1.0',
    '{"modules":["sales","ops","finance"],"objects":["product","inventory"]}'::jsonb,
    true
  ),
  (
    'events_tours',
    'Events & tours',
    'Wanders-style itinerary and booking money fields.',
    '0.1.0',
    '{"modules":["sales","delivery"],"objects":["deal"]}'::jsonb,
    true
  )
on conflict (pack_key) do nothing;
