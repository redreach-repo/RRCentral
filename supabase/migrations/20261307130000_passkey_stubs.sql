-- M13: passkey enrollment stub rows (no live WebAuthn credentials).

create table if not exists public.mfa_passkey_stubs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  user_email text not null default '',
  nickname text not null default 'Passkey',
  created_at timestamptz not null default now()
);

create index if not exists mfa_passkey_stubs_user_idx
  on public.mfa_passkey_stubs (tenant_id, user_email);

alter table public.mfa_passkey_stubs enable row level security;
revoke all on public.mfa_passkey_stubs from anon, authenticated;
grant select, insert, update, delete on public.mfa_passkey_stubs to authenticated;

drop policy if exists "Members read own passkey stubs" on public.mfa_passkey_stubs;
create policy "Members read own passkey stubs" on public.mfa_passkey_stubs
  for select to authenticated
  using (
    tenant_id = public.rr_my_tenant_id()
    and (
      lower(user_email) = coalesce(public.rr_current_email(), '')
      or public.rr_is_admin()
    )
  );

drop policy if exists "Members write own passkey stubs" on public.mfa_passkey_stubs;
create policy "Members write own passkey stubs" on public.mfa_passkey_stubs
  for all to authenticated
  using (
    tenant_id = public.rr_my_tenant_id()
    and lower(user_email) = coalesce(public.rr_current_email(), '')
  )
  with check (
    tenant_id = public.rr_my_tenant_id()
    and lower(user_email) = coalesce(public.rr_current_email(), '')
  );

drop policy if exists "Tenant isolation" on public.mfa_passkey_stubs;
create policy "Tenant isolation" on public.mfa_passkey_stubs
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

-- Strip broad policies from security_rls (re-applied on migration pass 2).
drop policy if exists "Staff full access" on public.mfa_passkey_stubs;
drop policy if exists "Viewers read" on public.mfa_passkey_stubs;

comment on table public.mfa_passkey_stubs is
  'M13 passkey stub nicknames only — live WebAuthn enroll later.';
