-- M13: idempotent invoice→GL draft source key.

create unique index if not exists gl_journals_tenant_source_uidx
  on public.gl_journals (tenant_id, source_type, source_id)
  where source_id <> '' and status <> 'void';

comment on index public.gl_journals_tenant_source_uidx is
  'M13: one non-void journal per source (e.g. invoice auto-post draft).';
