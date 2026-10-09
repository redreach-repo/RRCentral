-- Fix owned_domains RLS regression (20261008120000 re-opened anon/authenticated open access).
-- Match post-hardening pattern: staff-only for authenticated; anon gets nothing.

alter table public.owned_domains enable row level security;

revoke all on public.owned_domains from anon;

drop policy if exists "Authenticated users full access" on public.owned_domains;
drop policy if exists "Anon full access" on public.owned_domains;
drop policy if exists "Staff full access" on public.owned_domains;

create policy "Staff full access" on public.owned_domains
  for all to authenticated
  using (public.rr_is_staff())
  with check (public.rr_is_staff());

notify pgrst, 'reload schema';
