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

## D9 — Money is bigint minor units, rounded half away from zero (A1)

- **What:** `app/src/lib/money` holds amounts as `bigint` minor units with ISO 4217 decimals; rounding defaults to half away from zero. Legacy `number` helpers delegate to it. No decimal library added.
- **Why:** Matches Postgres `round(numeric, n)`, so browser and database agree; no new dependency. The old float rounding was wrong on half-fil cases (1.005 → 1.00); the new result (1.01) is what the database already computes.
- **Spec note:** the condensed `MASTER_SPEC.md` has no sections 3.5, 6.7 or 10.3; A1 followed the prompt text and GAP_PLAN rows instead.
- **Change later:** pass `'half-even'` per call if an accountant asks for banker's rounding on a report.

## D10 — Trusted payroll and ledger logic lives in the database, with a browser fallback (A1)

- **What:** Payroll lines are generated, updated and totalled by security-definer functions; a trigger recomputes net on every save; journals can only become `posted` inside `rr_gl_post_journal`. The browser calls the RPCs and only falls back to its old maths when the function is missing (migration not yet applied).
- **Why:** Keep what works: live runs main without A1 SQL; the fallback avoids breaking payroll before Alfred applies it.
- **Gratuity as-of date:** kept as "today" (same as before) for the regression; a period-end as-of date is a later choice for Alfred.
- **HR / payroll permissions:** #413's SQL lets sales read and write HR and payroll tables; the fix #419 was closed unmerged. A1 functions check manager/admin themselves, but direct table access is still open on main. Do not apply `20261217120000` to live until A2 decides record and field rules.

## D11 — Keys stay in Supabase Vault; envelope via OpenPGP session keys (A1)

- **What:** Keep the Vault secret `hm_fle_key_v<N>` (no external KMS: no new paid service). Each value is encrypted with its own random session key (`sess-key=1`), wrapped by the key derived from the Vault secret.
- **Why:** Keys never sit in table rows; rotation already works by version.
- **Change later:** move the key-encryption key to a cloud KMS if a customer contract needs it.

## D12 — Masked by default; reveal needs manager/admin, 20 per 10 minutes, always logged (A1)

- **What:** `rr_hr_masked` returns masks only. `rr_fle_reveal` returns plain text for manager/admin (HR, payroll, passenger fields) or admin (anything else), counts against `fle.reveal_limit_per_10min` (default 20), and writes `fle_access_log` with outcome and reason for every attempt, including denied ones.
- **Why:** Safest default until A2 brings per-field permissions.
- **Kept:** `rr_hr_sensitive` (from the earlier module) is unchanged so nothing that calls it breaks.

## D13 — ID numbers have no plain column; other fields blank only when enforced (A1)

- **What:** Emirates ID, passport and national ID (Aadhaar / PAN / SIN / other) on employees are written only through `rr_hr_set_identity` and stored encrypted. Existing plain fields (salary, IBAN, passenger passports, token settings) get encrypted copies; blanking the plain copy is opt-in per area (`fle.enforce.hr|wanders|settings`).
- **Why:** Additive only, and live pages still read the plain columns. Bank routing codes and labour card numbers are not encrypted (routing codes identify a bank, not a person; labour card numbers were not in the A1 list).
