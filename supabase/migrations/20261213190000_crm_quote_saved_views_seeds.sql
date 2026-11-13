-- RRCRM M2 — seed shared saved views for CRM and Quotations (idempotent).
insert into public.saved_views (
  tenant_id, module_id, name, filters, columns, sort, is_shared, is_default, owner_user_id
)
select
  'a0000000-0000-4000-8000-000000000001'::uuid,
  v.module_id,
  v.name,
  v.filters::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  v.is_default,
  null
from (values
  ('crm', 'My Day', '{"follow":"Due"}', false),
  ('crm', 'All deals', '{}', false),
  ('crm', 'Board', '{"view":"board"}', false),
  ('crm', 'Unassigned', '{"owner":"Unassigned","follow":"All"}', false),
  ('quotations', 'All quotes', '{}', true),
  ('quotations', 'Drafts', '{"status":"Draft"}', false),
  ('quotations', 'Sent', '{"status":"Sent"}', false),
  ('quotations', 'Awarded', '{"status":"Awarded"}', false)
) as v(module_id, name, filters, is_default)
where not exists (
  select 1
  from public.saved_views s
  where s.tenant_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    and s.module_id = v.module_id
    and s.name = v.name
);
