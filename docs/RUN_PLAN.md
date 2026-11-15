# Run plan — Batch M10, M11, M12 deepen

**Started:** 15 November 2026 (Asia/Dubai)  
**Branch:** `cursor/batch-m10-m12-d3d5` (from `main`)  
**Spec:** Master Spec v2.1  
**Note:** M8–M9a PR #438 may still be open; this batch does not depend on it.

---

## M10 — Marketing deepen

- [x] Campaigns CRUD already on main
- [x] Contact marketing consent + segments + campaign recipients
- [ ] Live ESP / send providers (Not done — Alfred / secrets)

## M10 — AI retrieval (light)

- [x] FTS knowledge docs table + search helper (no pgvector yet)
- [x] Thin `hm-ai-gateway` Edge (retrieve + stub answer; tools-as-user later)
- [ ] Live embedding / pgvector (Not done)

## M10 — Fireflies webhook

- [x] `fireflies-webhook` Edge + shared-secret ingest → account activity
- [ ] Fireflies dashboard URL config in production (Alfred)

## M11 — Workspace provisioner

- [x] `business_type_packs` + idempotent provision RPC/Edge scaffold
- [x] `/workspace-setup` form (local/demo safe)
- [ ] Live multi-tenant DNS / Stripe Tax (Not done)

## M11 — App identity remainder

- [x] `tenant_app_identities` table + helpers
- [ ] Per-host served manifests at `*.highmast.app` (Alfred / hosting)

## M12 — Industry pack templates

- [x] Object/field/pipeline template seeds for eng/construction/trading
- [x] Apply templates on activate (idempotent client helpers)
- [ ] Full Eng/Construction domain objects (later M12a/b)

## Quality gates

- [x] typecheck / lint / vitest / SQL module tests
