-- M10: light AI retrieval via Postgres FTS (pgvector later).

create table if not exists public.ai_knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  title text not null default '',
  body text not null default '',
  source text not null default 'manual',
  source_ref text not null default '',
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_knowledge_docs_tsv_idx
  on public.ai_knowledge_docs using gin (search_tsv);
create index if not exists ai_knowledge_docs_tenant_idx
  on public.ai_knowledge_docs (tenant_id, updated_at desc);

create or replace function public.rr_ai_search_docs(p_query text, p_limit int default 5)
returns table (
  id uuid,
  title text,
  body text,
  source text,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.id, d.title, d.body, d.source,
         ts_rank(d.search_tsv, plainto_tsquery('english', coalesce(p_query, '')))::real as rank
  from public.ai_knowledge_docs d
  where d.tenant_id = public.rr_my_tenant_id()
    and d.search_tsv @@ plainto_tsquery('english', coalesce(p_query, ''))
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

revoke all on function public.rr_ai_search_docs(text, int) from public;
grant execute on function public.rr_ai_search_docs(text, int) to authenticated;

alter table public.ai_knowledge_docs enable row level security;
revoke all on public.ai_knowledge_docs from anon, authenticated;
grant select, insert, update, delete on public.ai_knowledge_docs to authenticated;

drop policy if exists "Members read ai_knowledge_docs" on public.ai_knowledge_docs;
create policy "Members read ai_knowledge_docs" on public.ai_knowledge_docs
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write ai_knowledge_docs" on public.ai_knowledge_docs;
create policy "Staff write ai_knowledge_docs" on public.ai_knowledge_docs
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.ai_knowledge_docs;
create policy "Tenant isolation" on public.ai_knowledge_docs
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.ai_knowledge_docs;
drop policy if exists "Viewers read" on public.ai_knowledge_docs;

comment on table public.ai_knowledge_docs is 'M10: tenant knowledge snippets for FTS retrieval (no embeddings yet).';
comment on function public.rr_ai_search_docs(text, int) is 'M10: ranked FTS over ai_knowledge_docs for the caller tenant.';
