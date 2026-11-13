# RRCRM status

**Last updated:** 13 November 2026 (Asia/Dubai)  
**Current milestone:** M0 Audit and foundation (docs)

## Shipped this turn (M0 docs)

- `docs/AUDIT.md` — full repo audit (routes, 89 tables + RLS, auth, env names, edge functions, jobs, debt)
- `docs/GAP_PLAN.md` — exists / partial / missing vs Master Spec v1.1
- `docs/COMPLIANCE_NOTES.md` — stub for verify-before-ship findings
- `docs/MIGRATIONS.md` — stub for milestone migration notes
- `brand-assets/` — Red Reach brand kit seed (Appendix C) + `brand.json`
- `docs/SPEC_POINTER.md` — points Cursor at Master Spec v1.1 as authority

## Decisions recorded

- **Job runner (M0):** keep **pg_cron + Supabase Edge Functions** (+ existing browser contract-billing fallback). Revisit Inngest/Trigger.dev only if multi-tenant queue needs exceed cron.
- **Stack:** keep Vite + React + Supabase + Stripe; no framework rewrite.
- **TypeScript strict on main app:** deferred to M1 (enable with fix-forward); Tee Tribe already strict.

## Left for M0 acceptance close-out (code/CI — next PR after Alfred OK)

- Optional: CI assertion listing tables without policies that are not in an allowlist (`drive_connection`, `worship_setup_log`)
- Optional: add Sentry project (ask before new paid service)
- Do **not** start `tenant_id` retrofit until Alfred confirms M1 start

## Open decisions (flagged — do not guess)

See Master Spec §19 (name, residency, pricing, e-sign level, pilots, AI providers, reviewers, demo style, Arabic in demo).

## Next milestone

**M1 Platform core** — only after Alfred signs off on M0 and answers residency/demo-project timing as needed.
