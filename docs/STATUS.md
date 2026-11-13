# RRCRM status

**Last updated:** 13 November 2026 (Asia/Dubai)  
**Current milestone:** M1 Platform core (in progress)

## Shipped this turn (M1 platform slice)

- `supabase/migrations/20261213120000_platform_tenancy.sql` — `tenants` / `companies` / `business_units` / `brand_kits` / `event_outbox`; Red Reach seeded as tenant one; `tenant_id` stamped on all public business tables; RESTRICTIVE RLS isolation + `rr_my_tenant_id()` / `rr_same_tenant()`
- `supabase/tests/tenant_isolation_test.sql` — cross-tenant CRM/vendor/user isolation (wired into `tests/run.sh`)
- Company switcher in Layout top bar (`TenantContext`)
- Brand kit types + CSS vars; assets served from `app/public/brand/` (seeded from `brand-assets/`)
- Module registry skeleton (`app/src/modules/registry.ts`) + Guide route `/guide`
- EN/AR i18n skeleton (`I18nContext` + RTL `dir`)

## Decisions recorded

- **Job runner (M0):** keep **pg_cron + Supabase Edge Functions** (+ existing browser contract-billing fallback).
- **Stack:** keep Vite + React + Supabase + Stripe; no framework rewrite.
- **M1 tenancy approach:** additive columns + RESTRICTIVE policies (existing permissive policies kept). Single-tenant production backfills to Red Reach; isolation proven with a second demo tenant in CI SQL.

## Still open on M1 (next slices)

- Move Layout `navGroups` fully into module manifests (registry currently parallel)
- Record-level / field-level permission masks
- Zod standardization on forms
- TypeScript `strict` on main app (fix-forward)
- PWA icons regenerated from brand mark
- Demo Supabase project timing (Alfred)
- Missing brand assets: Boost / Care / Trading logos, SVGs, light variants

## Open decisions (flagged — do not guess)

See Master Spec §19 (name, residency, pricing, e-sign level, pilots, AI providers, reviewers, demo style, Arabic in demo).

## Next milestone after M1 close

**M2** Customization layer (fields, pipelines, objects, workflows, templates, views, numbering).
