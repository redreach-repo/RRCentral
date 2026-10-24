-- Prepares an empty Postgres database to receive a restore of the nightly
-- RR Central backup (public and auth schemas from Supabase). Creates the
-- Supabase roles the policies name and the extensions schema the column
-- defaults point at. Safe to run more than once.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator',
                           'supabase_admin', 'supabase_auth_admin', 'dashboard_user'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- A database built from the migrations on plain Postgres (CI, local) has
-- uuid-ossp in public rather than in extensions, so offer it there too.
create or replace function public.uuid_generate_v4() returns uuid
  language sql volatile as $$ select extensions.uuid_generate_v4() $$;
