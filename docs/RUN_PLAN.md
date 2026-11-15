# Run plan — Batch M0 through M3a

**Started:** 15 November 2026 (Asia/Dubai)  
**Branch:** `cursor/batch-m0-m3a-d3d5`  
**Spec:** Master Spec v2.1 (`MASTER_SPEC.md`)

Execute top to bottom. Tick when quality gates pass. Do not wait for approval between items.

---

## M0 — Audit and plan

- [x] Condensed `MASTER_SPEC.md` in repo (authority + Accept when)
- [x] `docs/SPEC_POINTER.md` points at v2.1
- [x] Refresh `docs/AUDIT.md` executive summary for multi-tenant reality
- [x] Refresh `docs/GAP_PLAN.md` (demo isolation status honest)
- [x] `docs/DECISIONS.md` + `docs/QUESTIONS.md`
- [x] Brand / PRODUCT constant audit already on main (`docs/BRAND_AUDIT.md`)
- [x] RLS: every public table has RLS (re-assert in AUDIT)
- [ ] External: Boost/Care/Trading SVG masters (blocked — zip)
- [ ] External: Sentry project keys if Alfred wants paid observability now (optional)

## M1 — Platform core (verify + fill)

- [x] `tenants` / `companies` / `business_units` / `brand_kits` + seed Red Reach
- [x] `tenant_id` stamp + RESTRICTIVE RLS on core tables
- [x] Cross-tenant CI (`tenant_isolation_test.sql`)
- [x] Roles + permissions (`permissions.ts`)
- [x] Module registry / flags + company switcher + I18n EN+AR skeleton
- [x] Event outbox claim/worker path
- [x] PRODUCT constant + HighMast colours
- [x] Theme light/dark token pairs
- [x] PWA after sign-in follows brand kit (partial §5.6)
- [ ] Per-host manifests + `tenant_app_identities` (deferred M11 — Not done)
- [ ] MFA passkeys / SSO (deferred — Not done)
- [ ] Field-level encryption fully wired for all sensitive columns (partial — Not done remainder)

## M2 — Customization layer (verify + fill)

- [x] Custom field definitions + values
- [x] Pipelines + stages
- [x] Saved views
- [x] Numbering sequences
- [x] Workflow definitions + runner (approval/notify)
- [x] Industry pack catalog + activate → moduleFlags
- [x] CRM/quote custom field + saved view seeds
- [ ] Dashboard builder UI (deferred later packs — Not done)
- [ ] Full terminology override UI (partial labels only — Not done)

## M3 — CRM unify (verify + fill)

- [x] Pipeline board `/deals` unions crm / sales / ctrm
- [x] Write façade (`myDealsStore`)
- [x] Soft-retire / hide detail nav setting
- [x] Read model `pipeline_deals_v`
- [x] Account link coverage plan
- [x] Document non-destructive consolidate plan (`docs/M3_CRM_UNIFY.md`)
- [x] Regression: quote accept + myDeals unit tests green
- [ ] Destructive schema merge (explicitly deferred — Not done)

## M3a — Demo isolation (code-side closeout)

- [x] `VITE_APP_ENV=demo` detection + DEMO banner
- [x] Browser fetch guard
- [x] Build refuses demo→live Supabase URL
- [x] Edge `APP_ENV=demo` outbound guard + tests
- [x] `demo_seed.sql` with safety gates + fictional data
- [x] Expand seed: sales deal story + contacts + Falcon Bay brand kit
- [x] Guided tour checklist (demo build only)
- [x] Demo role switcher (UI override, demo build only)
- [x] Presenter reset SQL (`demo_reset.sql`)
- [x] Docs: `M3A_DEMO.md`, `modules/demo-isolation.md`, STATUS Not done for Alfred
- [ ] Alfred: provision demo Supabase + `DEMO_*` secrets (blocked — Not done)
- [ ] Demo Pages deploy workflow (blocked until project exists — Not done)
- [ ] Self-serve rate limits / expiry / name blocklist (open §19 — Not done)

## Quality gates (batch)

- [x] `npm run typecheck` in `app/`
- [x] Unit tests: full suite **1311** passed (242 files)
- [x] Lint (`oxlint` — existing warnings only, no new errors)
