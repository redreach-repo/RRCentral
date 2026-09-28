-- Fix: vendors table had RLS enabled without policies (blocks Save vendor).
-- Run this in the Supabase SQL editor, then try Save vendor again.

alter table vendors enable row level security;

drop policy if exists "Authenticated users full access" on vendors;
create policy "Authenticated users full access" on vendors
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Anon full access" on vendors;
create policy "Anon full access" on vendors
  for all using (auth.role() = 'anon')
  with check (auth.role() = 'anon');

notify pgrst, 'reload schema';
