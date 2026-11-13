-- RRCRM M2 — seed starter custom fields for CRM leads and quotations.
-- Safe to re-run (unique on tenant_id, object_type, field_key).

insert into public.custom_field_definitions (
  tenant_id, object_type, field_key, label, field_type, options, required, sort_order, active
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'crm',
    'lead_source_detail',
    'Lead source detail',
    'text',
    '[]'::jsonb,
    false,
    10,
    true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'crm',
    'decision_maker',
    'Decision maker',
    'text',
    '[]'::jsonb,
    false,
    20,
    true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'crm',
    'competitor',
    'Competitor',
    'select',
    '["None","Local","Regional","Global","Other"]'::jsonb,
    false,
    30,
    true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'quotation',
    'site_visit_required',
    'Site visit required',
    'boolean',
    '[]'::jsonb,
    false,
    10,
    true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'quotation',
    'installation_notes',
    'Installation notes',
    'text',
    '[]'::jsonb,
    false,
    20,
    true
  )
on conflict (tenant_id, object_type, field_key) do nothing;
