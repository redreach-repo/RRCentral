-- RRCRM M2 — seed starter custom fields for Red Reach accounts.
-- Safe to re-run (unique on tenant_id, object_type, field_key).

insert into public.custom_field_definitions (
  tenant_id, object_type, field_key, label, field_type, options, required, sort_order, active
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'account',
    'preferred_carrier',
    'Preferred carrier',
    'select',
    '["Aramex","DHL","Emirates Post","Other"]'::jsonb,
    false,
    10,
    true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'account',
    'billing_notes',
    'Billing notes',
    'text',
    '[]'::jsonb,
    false,
    20,
    true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'account',
    'nda_on_file',
    'NDA on file',
    'boolean',
    '[]'::jsonb,
    false,
    30,
    true
  )
on conflict (tenant_id, object_type, field_key) do nothing;
