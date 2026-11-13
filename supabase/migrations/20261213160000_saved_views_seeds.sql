-- RRCRM M2 — seed shared saved views for Accounts (idempotent).
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
  ('accounts', 'All accounts', '{}', true),
  ('accounts', 'RR Threads', '{"type":"rr_threads_client"}', false),
  ('accounts', 'Unassigned', '{"owner":"none"}', false)
) as v(module_id, name, filters, is_default)
where not exists (
  select 1
  from public.saved_views s
  where s.tenant_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    and s.module_id = v.module_id
    and s.name = v.name
);
