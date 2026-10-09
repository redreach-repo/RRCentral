-- Extend audit triggers to company_documents, owned_domains, attachments.
-- Safe to re-run. Requires audit_log + rr_audit_trigger from 20260926080000.

do $$
declare
  t text;
  has_fn boolean;
begin
  if to_regclass('public.audit_log') is null then
    raise notice 'audit_log missing — skip extend';
    return;
  end if;

  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) into has_fn;

  if not has_fn then
    raise notice 'rr_audit_trigger missing — skip extend';
    return;
  end if;

  foreach t in array array['company_documents', 'owned_domains', 'attachments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists rr_audit on public.%I', t);
      execute format(
        'create trigger rr_audit after insert or update or delete on public.%I
           for each row execute function public.rr_audit_trigger()',
        t
      );
    end if;
  end loop;
end $$;
