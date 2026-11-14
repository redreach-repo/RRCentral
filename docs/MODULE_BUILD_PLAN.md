# Gap plan module build plan (Claude + Cursor)

**Started:** 14 November 2026, overnight build requested by Alfred.
**Source:** the "missing" rows of `docs/GAP_PLAN.md` (and its v1.2 refresh in PR #404).
**Who reads this:** Claude (acting as COO and building its share) and Cursor (building its share). Alfred points Cursor at this file. Each module's live status is the first lines of its own `docs/modules/<module>.md` (so two PRs never edit the same line); Claude refreshes the summary table at the bottom.

Alfred's list has 13 names (he wrote "14"): HR, Payroll, Marketing, SaaS tenant billing, Public REST API + webhooks, Maker-checker, Industry packs, AI approval queue, Field-level encryption, Sentry/structured logs, Demo isolation, WPS/gratuity, Arabic bilingual PDFs. Payroll and WPS/gratuity are kept as two modules, so the table below has 13 rows. If a 14th module was meant, it is not in this plan yet.

**Update 14 Nov 20:40 UTC (read this first).** While this plan was being written, Cursor's #413 (merged 20:10 UTC) shipped first slices of eight modules and #415 is deepening them: HR, Payroll, WPS/gratuity, Marketing, SaaS tenant billing, Industry packs, Maker-checker and Public API + webhooks (`docs/FEATURE_SLICES_M6_M12.md`). So the split below is **revised**: those eight stay with Cursor, and Claude takes the five nobody has started, plus a security fix for the merged slices. Claude closed its own duplicate drafts for Maker-checker (#416) and Public API (#417).

The gap plan only has one line per module and MASTER_SPEC v1.2 is not in the repo, so the acceptance criteria below are our own reading. Anything that needs a business, legal or pricing answer is listed under "Needs Alfred" and must not be invented in code.

---

## Rules (both agents)

1. **One concern per PR.** One module per PR. If a module is too big, split it into numbered PRs (e.g. "HR 1/2"), each one usable on its own.
2. **Draft PRs only. Never merge.** Alfred merges.
3. **No live data, no live setup.** Do not apply SQL to the live Supabase project, set secrets, deploy functions, or touch Stripe live mode. Write the SQL and the setup steps in the PR and in `docs/modules/<module>.md`; Alfred runs them through the SQL copy page and the "Deploy Edge Functions" Actions button. Alfred has no local checkout, so never give him CLI commands.
4. **RLS on every new table** (and drop the broad `"Staff full access"` / `"Viewers read"` policies that older migrations add to every table when CI re-runs them), plus the RESTRICTIVE `"Tenant isolation"` policy (`rr_same_tenant(tenant_id)`) and a `tenant_id uuid not null default` the Red Reach tenant, the same pattern as `20261213170000_pipelines_workflows.sql`.
5. **Migrations safe to re-run** (`create table if not exists`, `drop policy if exists` then `create policy`, `create or replace function`, `on conflict do nothing`). `supabase/tests/run.sh` applies every migration twice in CI.
6. **Tests:** unit tests (Vitest) for the logic, plus a SQL test file `supabase/tests/modules/<module>_test.sql` with an access check for every role (admin, manager, sales, staff, viewer, and anon where relevant) and a cross-tenant check. A NOTICE containing `TEST FAILED` or any `ERROR:` fails CI. Start the file with `begin;` and `\ir _fixtures.sql` (one user per role in tenant A, an admin in tenant B, `pg_temp.login('sales')` etc.) and end with `rollback;`.
7. **Not stacked.** Each PR branches from `main`. Keep it current with `main` so Alfred never sees GitHub's conflict editor. If two of one agent's PRs must touch the same line, say the merge order in the PR body.
8. **Honest status.** "Built and tested" only when CI-equivalent checks ran green. Say what is stubbed, what needs a secret, and what is unverified.
9. **Compliance flags.** Anything resting on UAE law (labour law, WPS/SIF format, gratuity, VAT, PDPL) is marked in code comments and the module doc as **NEEDS ALFRED / EXPERT VERIFICATION**, with the source we used.

## How to avoid touching the same files

This PR adds plug-in slots so a module PR only adds new files:

| Need | Where it goes (new files only) |
|------|--------------------------------|
| Sidebar group + routes | `app/src/modules/extensions/<module>/module.tsx` (default export `ExtensionModule`; pages via `React.lazy`) |
| EN + AR labels | `app/src/modules/extensions/<module>/strings.ts` (keys `nav.module.<id>`, `nav.item.<path>`, `page.<module>.*`) |
| Pages, components | `app/src/modules/extensions/<module>/` |
| Logic + unit tests | `app/src/lib/<module>/` |
| Migration | `supabase/migrations/<timestamp>_<module>.sql` in the agent's own timestamp range (below) |
| SQL access tests | `supabase/tests/modules/<module>_test.sql` (run.sh runs every file there) |
| Edge Function | `supabase/functions/hm-<name>/index.ts` (CI type-checks every `hm-*`; deploy with Function = `other`, name typed in) |
| Docs and setup | `docs/modules/<module>.md` |

**Timestamp ranges** so migrations never collide: Claude `202612200000xx` to `202612299999xx`; Cursor `202612300000xx` and later.

**Files that are still shared** (append a block, keep it small, rebase before pushing):
`supabase/config.toml` (only for `verify_jwt = false` functions), `supabase/tests/functions/public_functions_test.ts` (`GUARDS` entry for that function), Status goes in `docs/modules/<module>.md`, not in this file.

**Do not edit** in a module PR: `App.tsx`, `modules/nav.ts`, `lib/i18n.ts`, `lib/localDb.ts`, `supabase/tests/rls_test.sql`, `tenant_isolation_test.sql`, `run.sh`, `.github/workflows/*`. New module tables are Supabase only; pages show `modules/extensions/_shared/SetupNotice.tsx` in local (IndexedDB) mode or when the SQL has not been run.

---

## Split (revised)

| # | Module | Owner | Where |
|---|--------|-------|-------|
| 1 | Maker-checker | Cursor | #413 merged, #415 open |
| 2 | Public REST API + webhooks | Cursor | #413 merged, #415 open |
| 3 | Sentry / structured logs | Claude | draft #418 |
| 4 | Demo isolation | Claude | |
| 5 | Field-level encryption | Claude | |
| 6 | HR | Cursor | #413 merged, #415 open |
| 7 | Payroll | Cursor | #413 merged, #415 open |
| 8 | WPS / gratuity | Cursor | #413 merged, #415 open (planning only, not legal advice) |
| 9 | Arabic bilingual PDFs | Claude | |
| 10 | Marketing | Cursor | #413 merged, #415 open |
| 11 | SaaS tenant billing | Cursor | #413 merged, #415 open |
| 12 | AI approval queue | Claude | |
| 13 | Industry packs | Cursor | #413 merged, #415 open |
| – | Permission fix for the #413 tables | Claude | draft #419 (new migration only, no Cursor files) |

**Cursor: please do not edit** `supabase/functions/_shared/functionHealth.ts`, `lib/errorReporting.ts` (Claude #418) or anything under `modules/extensions/`. **Claude will not edit** `featureSliceStores.ts`, the M6–M12 pages, `supabase/functions/public-api/`, or Cursor's migrations; fixes to Cursor's tables go in new Claude migrations only.

### Security notes for Cursor's eight modules (from Claude's review of #413)
The #413 migration gives every `rr_is_staff()` user (admin, manager **and sales**) full read/write on `hr_employees`, `payroll_runs`, `payroll_lines`, `approval_requests`, `api_keys` and `webhook_endpoints`. That means a sales user could read salaries and IBANs, approve any request including their own, mint an API key by inserting their own hash, and read webhook secrets. Claude's permission-fix PR tightens this in a new migration (HR/payroll: manager and admin; keys and webhooks: admin; approvals: four eyes enforced by a trigger). **Alfred: do not run `20261217120000_feature_slices_m6_m12.sql` on the live database without that fix.**

## Acceptance criteria

The criteria below were written before the re-split; for modules now owned by Cursor they are a checklist Cursor can use, not a second implementation.

### 1. Maker-checker (Claude)
- Table `approval_requests` (entity type, entity id, action, payload snapshot, amount, status pending/approved/rejected/cancelled, maker, checker, reason, timestamps) with RLS and tenant isolation.
- Rule: the maker can never approve their own request (enforced in the database, not only the UI). Only manager/admin can approve; staff/viewer cannot approve.
- Tenant-level policy table `approval_policies` (which actions need a checker, amount threshold) editable by admin only.
- SQL function to approve/reject that records who and when and appends to `audit_log`.
- Page "Approvals" listing pending requests with approve/reject + reason.
- Tests: self-approval refused, each role's access, cross-tenant refused, threshold logic unit-tested.

### 2. Public REST API + webhooks (Claude)
- API keys per tenant: only a hash is stored, shown once on creation, scoped (read/write per object), revocable, last-used time. Admin only.
- Edge Function `hm-public-api` with versioned read endpoints (`/v1/accounts`, `/v1/invoices`, `/v1/quotations` at minimum), cursor pagination, tenant scoped by the key. Writes only where the scope allows.
- Webhook endpoints per tenant (URL, events, secret), HMAC-SHA256 signed deliveries with timestamp, retry with backoff, delivery log. Fed from `event_outbox`.
- Tests: bad/revoked key refused, scope refused, signature verifies, cross-tenant refused. OpenAPI doc in `docs/modules/public-api.md`.

### 3. Sentry / structured logs (Claude)
- One JSON log shape (level, message, request id, tenant, function, duration, error) for Edge Functions and the browser.
- Sentry wired behind a DSN env var: off when unset (no new paid service turned on without Alfred). PII scrubbing (emails, tokens, IBAN) before send.
- Tests for the log formatter and scrubber.

### 4. Demo isolation (Claude)
- `isDemoEnv()` and an outbound guard used by mail, WhatsApp, Stripe and webhooks: in demo they no-op and log instead of sending.
- Demo banner, fictional seed pack script (no real brands, no Tee Tribe), and a CI check that the demo build refuses the live Supabase URL.
- Does **not** provision the second Supabase project (Alfred decides, per M3A_DEMO.md).

### 5. Field-level encryption (Claude)
- Encrypt chosen columns (salary, IBAN, OAuth tokens) with a key held outside the database (Supabase Vault / Edge secret), envelope style with a key id for rotation.
- Only roles with the right permission can decrypt; everyone else sees a masked value.
- Tests: round trip, wrong key fails, masking per role, rotation path. Key setup steps for Alfred; no key is generated into the repo.

### 6. HR (Claude)
- Employees (personal details, job, department, manager, join date, contract type, Emirates ID / passport / visa numbers and expiry dates), leave types, leave requests with approval, document expiry alerts.
- Sensitive fields (salary, IBAN, ID numbers) go through Field-level encryption once merged.
- Roles: admin/manager full; staff see only their own record and leave; viewer none for personal data.

### 7. Payroll (Claude)
- Pay components (basic, housing, transport, other allowances, deductions), monthly payroll run (draft → submitted → approved via Maker-checker → paid), payslips, exact money (integer fils, no floats).
- **NEEDS ALFRED VERIFICATION:** any UAE labour law rule used.

### 8. WPS / gratuity (Claude)
- End of service gratuity calculator (UAE Federal Decree-Law 33 of 2021 rules as we understand them) with unit tests per case.
- WPS SIF file generator (EDR + SCR records) from an approved payroll run.
- **NEEDS ALFRED / BANK VERIFICATION:** the exact SIF layout of his agent bank and the gratuity rules for his contract types. The file is a draft until verified with the bank.

### 9. Arabic bilingual PDFs (Cursor)
- Quotation, tax invoice and delivery note print with English and Arabic side by side (labels from the EN+AR catalogs, RTL Arabic column), Arabic font embedded, tenant brand kit applied.
- Arabic wording reviewed by a native speaker before live use (flag, do not invent legal phrasing).
- Visual tests (screenshots) for EN and AR in light print.

### 10. Marketing (Cursor)
- Segments from CRM/accounts, campaigns (email first, via the existing Zoho/Gmail/M365 senders), consent and unsubscribe status per contact, campaign results.
- Nothing sends in demo mode or without consent. No new paid mail service without Alfred.

### 11. SaaS tenant billing (Cursor)
- Plans, tenant subscriptions, seats, invoices for tenants, Stripe **test mode** checkout and webhook (`hm-saas-billing-webhook`), dunning states.
- Kept separate from Red Reach's own customer invoices and the Tee Tribe shop.
- **NEEDS ALFRED:** pricing and plan names (open in spec §19). Use placeholders.

### 12. AI approval queue (Cursor)
- AI-proposed actions (e.g. draft email, update a deal stage) land in a queue as proposals; a human approves, edits or rejects; only approved actions run, as the approving user.
- Full audit of prompt, proposal, decision. No AI action writes data directly.

### 13. Industry packs (Cursor)
- A pack = bundle of custom fields, pipelines, saved views, numbering and templates applied to a tenant through the existing customization layer, idempotent install and clean uninstall.
- One sample pack (e.g. "Logistics") plus the Red Reach pack carved out of shared core (WorshipHub, Tee Tribe, Wanders, CTRM commission stay tenant-specific per spec §B.7).

---

## Needs Alfred (do not invent)

- UAE labour law details for payroll and gratuity, his WPS agent bank and its SIF spec, MOL establishment id.
- SaaS pricing and plan names.
- Sentry account (paid service) and DSN.
- Second Supabase project for the demo.
- Arabic legal wording review for PDFs.
- Encryption key custody (who holds the master key, rotation schedule).

---

## Status summary (Claude refreshes this; the source of truth is each `docs/modules/<module>.md` or Cursor's `docs/FEATURE_SLICES_M6_M12.md`)

| # | Module | Owner | Status | PR |
|---|--------|-------|--------|----|
| 1 | Maker-checker | Cursor | first slice merged, deepening | #413, #415 |
| 2 | Public REST API + webhooks | Cursor | first slice merged, deepening | #413, #415 |
| 3 | Sentry / structured logs | Claude | built and tested, draft PR (needs a Sentry DSN to send anything) | #418 |
| 4 | Demo isolation | Claude | built and tested, draft PR (needs a separate demo Supabase project to use) | #420 |
| 5 | Field-level encryption | Claude | built and tested, draft PR (needs a Vault key; Cursor's HR pages still read plain columns) | #421 (after #419) |
| 6 | HR | Cursor | first slice merged, deepening | #413, #415 |
| 7 | Payroll | Cursor | first slice merged, deepening | #413, #415 |
| 8 | WPS / gratuity | Cursor | planning-only calc merged, deepening | #413, #415 |
| 9 | Arabic bilingual PDFs | Claude | built and tested, draft PR (Arabic wording needs a native speaker check) | #423 |
| 10 | Marketing | Cursor | first slice merged, deepening | #413, #415 |
| 11 | SaaS tenant billing | Cursor | first slice merged, deepening | #413, #415 |
| 12 | AI approval queue | Claude | built and tested, draft PR (never called against the real Claude API) | #422 |
| 13 | Industry packs | Cursor | first slice merged, deepening | #413, #415 |
| + | Permission fix for #413 tables | Claude | built and tested, draft PR; run before Cursor's M6–M12 SQL goes live | #419 |
