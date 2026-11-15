# Questions (answered with safe defaults)

Raised during batch **M0–M3a**. Agent picked a default and continued. Owner can override.

---

## Q1 — When to provision the demo Supabase project?

- **Options:** (a) Now (b) After first external prospect demo request (c) Never / use staging only
- **Pick:** (b) — code-side M3a complete; ops wait on Alfred. Recorded Not done in STATUS.
- **Blocks:** Live demo URL, `DEMO_*` secrets, Pages demo workflow.

## Q2 — Presenter-led vs self-serve demo?

- **Options:** (a) Presenter only (b) Self-serve with rate limits (c) Both
- **Pick:** (a) for this batch (tour + role switcher). Self-serve = later.
- **See:** `docs/DECISIONS.md` D3.

## Q3 — Data residency before first external customer?

- **Options:** UAE / EU / multi-region
- **Pick:** Defer explicit choice; keep documenting in COMPLIANCE_NOTES; do not lock infra.
- **Blocks:** Nothing in M0–M3a code.

## Q4 — Workspace / PWA install domain (§5.6 / §19)?

- **Options:** `*.highmast.app` vs custom domains only vs both
- **Pick:** After sign-in brand manifest for current host (shipped partial); per-host table deferred to M11.
- **Blocks:** Full §5.6 Accept when.

## Q5 — Boost / Care / Trading logo delivery?

- **Options:** Wait for zip (a) vs placeholder SVGs (b)
- **Pick:** (a) — do not invent brand marks. STATUS Not done.

## Q6 — Destroy CRM tables after unify?

- **Options:** Merge now (a) vs soft-retire indefinitely (b) vs scheduled cutover PR (c)
- **Pick:** (c) — plan written; no DROP this batch.
