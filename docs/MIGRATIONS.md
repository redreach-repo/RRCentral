# Migrations log

Milestone migration notes. Each entry: what moved, dry-run results, rollback.

## M0

No database migrations. Documentation and `brand-assets/` only.

## M1 — `20261213120000_platform_tenancy.sql`

**What**
- Creates `tenants`, `companies`, `business_units`, `brand_kits`, `event_outbox`
- Seeds Red Reach Middle East FZE as tenant `a0000000-0000-4000-8000-000000000001` with company + seven business units
- Adds nullable-then-defaulted `tenant_id` to every other public table (backfill = Red Reach)
- Adds `app_users.tenant_id`
- Helpers: `rr_my_tenant_id()`, `rr_same_tenant(uuid)`
- RESTRICTIVE policy `Tenant isolation` on all stamped tables (AND with existing staff policies)
- Platform table RLS for members/admins of own tenant only

**Dry-run / tests**
- Apply via `bash supabase/tests/run.sh` (migrations twice + `rls_test.sql` + `tenant_isolation_test.sql`)
- Tenant suite creates demo tenant B and asserts Red Reach admin cannot read B rows and B cannot forge inserts into A

**Rollback**
- Forward-only preferred. Emergency: drop restrictive policies named `Tenant isolation`, drop helpers, drop new tables, drop `tenant_id` columns (destructive — ask before production rollback).
- Does not rewrite historical permissive policies; removing RESTRICTIVE policies restores pre-M1 visibility within a single tenant.

**Risks**
- Any code path that inserts rows with an explicit foreign `tenant_id` will fail RLS (intended).
- Deploy migration before or with the app release that selects `app_users.tenant_id` (client falls back if column missing).

## M2 — `20261213140000_customization_layer.sql`

**What**
- `numbering_sequences` seeded from existing invoice/quotation/DN/account refs
- `rr_allocate_reference(doc_type, division_code, prefix)` — atomic, tenant-scoped; quotes+invoices share one RR counter
- `custom_field_definitions` / `custom_field_values` / `saved_views` (foundation tables + RLS)
- Restrictive tenant isolation on new tables

**Dry-run / tests**
- `bash supabase/tests/run.sh` includes `numbering_test.sql`

**Rollback**
- Forward-only preferred. Drop new tables/function only after confirming no production allocates depend on them; app falls back to client-side `generateReference`.
