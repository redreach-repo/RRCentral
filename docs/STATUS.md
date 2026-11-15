# HighMast / RR Central status

**Last updated:** 15 November 2026 (Asia/Dubai)  
**Spec:** Master Specification **v2.1** (`MASTER_SPEC.md`, `docs/SPEC_POINTER.md`)  
**Batch:** M0 through M3a (`docs/RUN_PLAN.md`)  
**Branch:** `cursor/batch-m0-m3a-d3d5`

## Milestone verdict (this batch)

| Milestone | Accept when | Result |
|-----------|-------------|--------|
| **M0** | Audit + gap plan + RLS + plan docs | **Pass** (SVG assets still external) |
| **M1** | Tenancy + PRODUCT + isolation tests | **Pass** with Not done: per-host PWA, MFA/SSO, full FLE |
| **M2** | Fields / stages / approval without deploy | **Pass** with Not done: dashboard builder, full terminology UI |
| **M3** | One pipeline hub; §B.3 intact; no silent DROP | **Pass** (destructive merge deferred) |
| **M3a** | Demo isolation + seed + presenter tools | **Pass code-side**; **Not done:** Alfred demo project, deploy workflow, self-serve limits |

## Shipped this batch

- `MASTER_SPEC.md`, `docs/RUN_PLAN.md`, `docs/DECISIONS.md`, `docs/QUESTIONS.md`
- AUDIT / GAP / M3A / demo-isolation refreshed for v2.1
- Demo guided tour + role switcher (`DemoPresenterChrome`)
- Expanded Falcon Bay seed + `demo_reset.sql`

## Not done (with reason)

1. Bank-certified WPS + counsel review — external legal/bank  
2. Official Boost/Care/Trading SVG masters — waiting on zip  
3. **Demo Supabase project + `DEMO_*` secrets + Pages workflow** — Alfred  
4. Self-serve demo rate limits / expiry / name blocklist — open §19  
5. Per-host PWA manifests / `tenant_app_identities` — M11  
6. MFA passkeys / SSO — later M1 remainder  
7. CRM table DROP / forced route merge — needs dedicated cutover PR  
8. Dashboard builder + full terminology UI — later customization polish  

## Test results (this batch)

- Typecheck: pass  
- Lint: pass (existing warnings only)  
- Vitest: **1311** passed / 242 files  

```bash
cd app && npm run typecheck && npm run lint && npx vitest run
```

## Still externally blocked (unchanged)

CASA · paid QTSP · WPS counsel · SVG zip · native app store accounts (v6) · §19 residency lock
