# Gap plan module build plan (Claude + Cursor)

**Started:** 14 November 2026, overnight build requested by Alfred.
**Source:** the "missing" rows of `docs/GAP_PLAN.md` (and its v1.2 refresh in PR #404).
**Who reads this:** Claude (acting as COO and building its share) and Cursor (building its share). Alfred points Cursor at this file. Each module's live status is the first lines of its own `docs/modules/<module>.md` (so two PRs never edit the same line); Claude refreshes the summary table at the bottom.

Alfred's list has 13 names (he wrote "14"): HR, Payroll, Marketing, SaaS tenant billing, Public REST API + webhooks, Maker-checker, Industry packs, AI approval queue, Field-level encryption, Sentry/structured logs, Demo isolation, WPS/gratuity, Arabic bilingual PDFs. Payroll and WPS/gratuity are kept as two modules, so the table below has 13 rows. If a 14th module was meant, it is not in this plan yet.

The gap plan only has one line per module and MASTER_SPEC v1.2 is not in the repo, so the acceptance criteria below are our own reading. Anything that needs a business, legal or pricing answer is listed under "Needs Alfred" and must not be invented in code.

---

## Rules (both agents)

1. **One concern per PR.** One module per PR. If a module is too big, split it into numbered PRs (e.g. "HR 1/2"), each one usable on its own.
2. **Draft PRs only. Never merge.** Alfred merges.
3. **No live data, no live setup.** Do not apply SQL to the live Supabase project, set secrets, deploy functions, or touch Stripe live mode. Write the SQL and the setup steps in the PR and in `docs/modules/<module>.md`; Alfred runs them through the SQL copy page and the "Deploy Edge Functions" Actions button. Alfred has no local checkout, so never give him CLI commands.
4. **RLS on every new table**, plus the RESTRICTIVE `"Tenant isolation"` policy (`rr_same_tenant(tenant_id)`) and a `tenant_id uuid not null default` the Red Reach tenant, the same pattern as `20261213170000_pipelines_workflows.sql`.
5. **Migrations safe to re-run** (`create table if not exists`, `drop policy if exists` then `create policy`, `create or replace function`, `on conflict do nothing`). `supabase/tests/run.sh` applies every migration twice in CI.
6. **Tests:** unit tests (Vitest) for the logic, plus a SQL test file `supabase/tests/modules/<module>_test.sql` with an access check for every role (admin, manager, sales, staff, viewer, and anon where relevant) and a cross-tenant check. A NOTICE containing `TEST FAILED` or any `ERROR:` fails CI.
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

**Do not edit** in a module PR: `App.tsx`, `modules/nav.ts`, `lib/i18n.ts`, `lib/localDb.ts`, `supabase/tests/rls_test.sql`, `tenant_isolation_test.sql`, `run.sh`, `.github/workflows/*`. New module tables are Supabase only; local (IndexedDB) mode shows a "run the SQL first" note instead of a store.

---

## Split

Claude takes the foundations and the high-risk money and people modules (they depend on each other). Cursor takes the modules that sit next to code it already owns (EN+AR catalogs, documents) or that stand alone.

| # | Module | Owner | Depends on |
|---|--------|-------|------------|
| 1 | Maker-checker | Claude | none |
| 2 | Public REST API + webhooks | Claude | none (uses `event_outbox`) |
| 3 | Sentry / structured logs | Claude | none |
| 4 | Demo isolation | Claude | none |
| 5 | Field-level encryption | Claude | none |
| 6 | HR | Claude | 5 for salary / IBAN fields |
| 7 | Payroll | Claude | 1, 5, 6 |
| 8 | WPS / gratuity | Claude | 6, 7 |
| 9 | Arabic bilingual PDFs | Cursor | none |
| 10 | Marketing | Cursor | none |
| 11 | SaaS tenant billing | Cursor | none (Stripe **test mode** only) |
| 12 | AI approval queue | Cursor | may reuse 1 once merged; build standalone first |
| 13 | Industry packs | Cursor | none |

Where a module depends on one that is not merged yet, it ships with a clearly marked seam (e.g. "salary stored in plain numeric until Field-level encryption merges") and says so in the PR.

---

## Acceptance criteria

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

## Status summary (Claude refreshes this; the source of truth is each `docs/modules/<module>.md`)

Status values: `not started` · `in progress` · `draft PR open` · `built and tested (draft)` · `blocked`.

| # | Module | Owner | Status | PR | Notes (stubbed / unverified) |
|---|--------|-------|--------|----|------------------------------|
| 1 | Maker-checker | Claude | not started | | |
| 2 | Public REST API + webhooks | Claude | not started | | |
| 3 | Sentry / structured logs | Claude | not started | | |
| 4 | Demo isolation | Claude | not started | | |
| 5 | Field-level encryption | Claude | not started | | |
| 6 | HR | Claude | not started | | |
| 7 | Payroll | Claude | not started | | |
| 8 | WPS / gratuity | Claude | not started | | |
| 9 | Arabic bilingual PDFs | Cursor | not started | | |
| 10 | Marketing | Cursor | not started | | |
| 11 | SaaS tenant billing | Cursor | not started | | |
| 12 | AI approval queue | Cursor | not started | | |
| 13 | Industry packs | Cursor | not started | | |
