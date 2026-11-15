# Decisions log

Autonomous picks for open Master Spec §19 items during batch **M0–M3a**. Each entry: what, why, how to change.

---

## D1 — Job runner stays pg_cron + Edge

- **What:** Keep `pg_cron` / `pg_net` invoking Edge Functions; domain events go through `event_outbox`.
- **Why:** Already live for Red Reach; lowest risk for M1–M3a.
- **Change later:** Introduce a dedicated queue worker that still consumes the same outbox rows.

## D2 — Demo project is Alfred-provisioned

- **What:** Code and seed/reset ship in-repo; no cloud project or GitHub `DEMO_*` secrets created by the agent.
- **Why:** Spec + prior STATUS: second Supabase project is an owner action; autonomous runs must not invent paid/cloud resources.
- **Change later:** After Alfred shares URL + keys, add a demo deploy workflow mirroring staging.

## D3 — Presenter tools in demo build; self-serve later

- **What:** Demo build gets banner, outbound guards, guided tour, and a **UI-only** role switcher. Self-serve signup rate limits / workspace expiry wait.
- **Why:** Spec §19 presenter vs self-serve is open; presenter path unblocks sales demos without pretending self-serve is done.
- **Change later:** Add rate limits + expiry when M3a ops project exists and §19 is closed.

## D4 — CRM schema merge remains non-destructive

- **What:** Soft-retire + façade + `pipeline_deals_v` only. No `DROP TABLE` for `crm` / `sales_deals` / `ctrm_deals`.
- **Why:** Spec keep-what-works + run rule: additive only; commissions and My Day briefing must not break.
- **Change later:** Dedicated cutover PR with explicit human approve (`docs/M3_CRM_UNIFY.md`).

## D5 — Demo role switcher does not bypass RLS

- **What:** Role switcher overrides `userRole` in the React shell only (`sessionStorage`). Postgres RLS still uses the signed-in `app_users` row.
- **Why:** Safe default — avoids a privilege-escalation backdoor if someone points a non-demo build at production by mistake (switcher is gated on `VITE_APP_ENV=demo`).
- **Change later:** Seed multiple demo auth users per role if a full RLS walkthrough is required.

## D6 — Falcon Bay as demo tenant story

- **What:** Seed renames default tenant to “Falcon Bay Trading (demo)”, `is_demo=true`, fictional `.example` accounts; demo brand kit colours use HighMast tokens without Red Reach logos.
- **Why:** Spec forbids real client brands in demo; one coherent story for the guided tour.
- **Change later:** Theme studio / brand kit assets when demo SVG pack exists.

## D7 — Starter CoA without claiming tax compliance (M7)

- **What:** Ship a 10-account UAE SME starter chart including “VAT payable”; mark Unverified in UI + COMPLIANCE_NOTES; no VAT return generator.
- **Why:** Unblocks double-entry without inventing FTA-certified mappings.
- **Change later:** Accountant-mapped tenant CoA packs; optional auto-post from invoices.

## D8 — Leave requests before full HR suite (M6)

- **What:** `hr_leave_requests` + manager approve path only; no attendance clock or org chart yet.
- **Why:** Highest-value HR deepen that reuses `hr_employees` without inventing labour-law attendance rules.
- **Change later:** Attendance / contracts HR pack after counsel input.
