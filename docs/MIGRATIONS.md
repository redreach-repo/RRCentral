# Migrations log

Milestone migration notes. Each entry: what moved, dry-run results, rollback.

## M0

No database migrations. Documentation and `brand-assets/` only.

## M1 — `20261213120000_platform_tenancy.sql`

**What**
- Creates `tenants`, `companies`, `business_units`, `brand_kits`, `event_outbox`
- Seeds Red Reach Middle East FZE as tenant `a0000000-0000-4000-8000-000000000001` with company + seven business units
- Adds nullable-then-defaulted `tenant_id` to every other public table (backfill = Red Reach)
- Adds `app_users.tenant_id`
- Helpers: `rr_my_tenant_id()`, `rr_same_tenant(uuid)`
- RESTRICTIVE policy `Tenant isolation` on all stamped tables (AND with existing staff policies)
- Platform table RLS for members/admins of own tenant only

**Dry-run / tests**
- Apply via `bash supabase/tests/run.sh` (migrations twice + `rls_test.sql` + `tenant_isolation_test.sql`)
- Tenant suite creates demo tenant B and asserts Red Reach admin cannot read B rows and B cannot forge inserts into A

**Rollback**
- Forward-only preferred. Emergency: drop restrictive policies named `Tenant isolation`, drop helpers, drop new tables, drop `tenant_id` columns (destructive — ask before production rollback).
- Does not rewrite historical permissive policies; removing RESTRICTIVE policies restores pre-M1 visibility within a single tenant.

**Risks**
- Any code path that inserts rows with an explicit foreign `tenant_id` will fail RLS (intended).
- Deploy migration before or with the app release that selects `app_users.tenant_id` (client falls back if column missing).

## M2 — `20261213140000_customization_layer.sql`

**What**
- `numbering_sequences` seeded from existing invoice/quotation/DN/account refs
- `rr_allocate_reference(doc_type, division_code, prefix)` — atomic, tenant-scoped; quotes+invoices share one RR counter
- `custom_field_definitions` / `custom_field_values` / `saved_views` (foundation tables + RLS)
- Restrictive tenant isolation on new tables

**Dry-run / tests**
- `bash supabase/tests/run.sh` includes `numbering_test.sql`

**Rollback**
- Forward-only preferred. Drop new tables/function only after confirming no production allocates depend on them; app falls back to client-side `generateReference`.

## M2 — `20261213150000_custom_field_seeds.sql`

**What**
- Seeds three account custom fields for Red Reach (preferred carrier, billing notes, NDA on file)

**Rollback**
- Delete those definition rows by `field_key` if needed; values cascade.

## M2 — `20261213160000_saved_views_seeds.sql`

**What**
- Seeds shared Accounts saved views (All / RR Threads / Unassigned)

**Rollback**
- Delete by `module_id = 'accounts'` and those names.

## M2 — `20261213170000_pipelines_workflows.sql`

**What**
- `pipelines` / `pipeline_stages` seeded for CRM, AI CRM sales, CTRM Next
- `workflow_definitions` / `workflow_runs` foundation + sample `crm_won_approval`
- RLS + restrictive tenant isolation

**Dry-run / tests**
- `bash supabase/tests/run.sh` includes `pipelines_test.sql`

**Rollback**
- Forward-only preferred. Drop new tables after confirming Settings/CRM no longer read them; CRM falls back to hardcoded `PIPELINE_STAGES`.

## M2 — `20261213180000_crm_quote_custom_field_seeds.sql`

**What**
- Seeds CRM custom fields (lead source detail, decision maker, competitor)
- Seeds quotation custom fields (site visit required, installation notes)

**Rollback**
- Delete those definition rows by `object_type` + `field_key`; values cascade.

## M2 — `20261213190000_crm_quote_saved_views_seeds.sql`

**What**
- Seeds shared CRM views (My Day, All deals, Board, Unassigned)
- Seeds shared Quotations views (All / Drafts / Sent / Awarded)

**Rollback**
- Delete by `module_id` in (`crm`,`quotations`) and those names.

## M1 — `20261216120000_event_outbox_claim.sql`

**What**
- `rr_claim_event_outbox(limit)` — FOR UPDATE SKIP LOCKED claim + 10-minute lease recovery for `event_outbox`
- Service-role only; used by the `event-outbox` Edge Function

**Dry-run / tests**
- Unit: `app/src/lib/eventOutboxWorker.test.ts`
- Edge auth: `supabase/tests/functions/public_functions_test.ts`

**Rollback**
- `drop function public.rr_claim_event_outbox(int);`


## M6–M12 — `20261217120000_feature_slices_m6_m12.sql`

**What**
- First-slice tables: `hr_employees`, `payroll_runs`/`payroll_lines`, `marketing_campaigns`, `tenant_subscriptions`, `industry_packs`/`tenant_industry_packs`, `approval_requests`, `api_keys`, `webhook_endpoints`
- RLS + restrictive tenant isolation; new module flags default hidden when no `moduleFlags` row exists
- Seeds two industry packs

**Rollback**
- Forward-only preferred. Drop new tables only after confirming no production data.


## WPS SIF draft fields — `20261217160000_wps_sif_draft_fields.sql`

**What**
- Adds `hr_employees.labour_card_no` and `hr_employees.bank_routing_code` for SIF/CSV drafts (not bank-certified)

**Rollback**
- `alter table public.hr_employees drop column if exists labour_card_no, drop column if exists bank_routing_code;`


## Industry packs Eng/Construction — `20261224120000_industry_packs_eng_construction.sql`

**What**
- Seeds `engineering`, `construction`, `trading_import`, `events_tours` into `industry_packs` (idempotent)

**Rollback**
- `delete from industry_packs where pack_key in ('engineering','construction','trading_import','events_tours');` (only if unused by `tenant_industry_packs`)

## Public API webhook retries — `20261217170000_public_api_webhook_retries.sql`

**What**
- `webhook_endpoints.delivery_failures` / `next_retry_at`
- `webhook_delivery_attempts` audit table (admin RLS)
- Consumed by Edge `webhook-retry` (cron secret)

**Rollback**
- Drop attempts table; drop new columns on `webhook_endpoints`.

## M3a — demo seed / reset (not a schema migration)

**What**
- `supabase/seed/demo/demo_seed.sql` — Falcon Bay story (accounts, contacts, CRM, sales deal, quotes, invoices, brand kit)
- `supabase/seed/demo/demo_reset.sql` — wipe demo-prefixed rows when `tenants.is_demo`, then re-seed
- No production schema change; gated by `app.demo_seed` + empty finance tables (seed) / `is_demo` (reset)

**Future retirement**
- When a dedicated demo tenant UUID is provisioned (not the Red Reach id), stop renaming tenant `a000…001` and seed into the real demo tenant id instead.

## M7 — `20261230120000_accounting_ledger.sql`

**What**
- `gl_accounts`, `gl_journals`, `gl_journal_lines`
- Balanced post via `rr_gl_post_journal`; posted immutability triggers
- Seed starter CoA for Red Reach tenant (Unverified tax mapping)
- RLS: manager/admin + restrictive tenant isolation

**Rollback**
- Drop triggers/functions; drop three tables (destructive — ask before production).

## M6 deepen — `20261230130000_hr_leave.sql`

**What**
- `hr_leave_requests` + `rr_hr_leave_decide`
- Manager/admin RLS + tenant isolation

**Rollback**
- Drop function + table (ask before production).


## M8a — `20261230150000_country_packs.sql`

**What**
- `country_packs` catalog (AE/IN/CA seeds) + `tenant_country_packs` activations
- RLS: staff read packs; admin write activations; restrictive tenant isolation
- Rule payloads Unverified — see `docs/COMPLIANCE_NOTES.md`

**Tests**
- `supabase/tests/modules/country_packs_test.sql`

**Rollback**
- Forward-only preferred. Drop tenant activations then catalog only if unused.


## M9 — `20261230160000_purchase_orders.sql`

**What**
- `purchase_orders` / `purchase_order_lines`
- `rr_po_receive_line` security definer: receive qty, bump `products.stock_on_hand` by SKU, log `inventory_movements`
- Strip Staff full access / Viewers after policy create

**Tests**
- `supabase/tests/modules/purchase_orders_test.sql`

**Rollback**
- Drop function then tables after confirming no production rows.


## M9b — `20261230170000_project_accounting.sql`

**What**
- `delivery_projects` + `project_cost_lines` with tenant RLS

**Tests**
- `supabase/tests/modules/project_accounting_test.sql`


## M9a — `20261230180000_client_purchase_orders.sql`

**What**
- `client_purchase_orders` linked to `accounts`

**Tests**
- `supabase/tests/modules/client_purchase_orders_test.sql`


## M8 deepen — `20261230190000_payroll_exports.sql`

**What**
- `payroll_exports` audit rows for CSV/SIF draft downloads

**Rollback**
- `drop table if exists public.payroll_exports;`


## M10–M12 deepen — `20261230200000` … `20261230240000`

**What**
- Marketing consent columns + `marketing_segments` / `marketing_campaign_recipients`
- `ai_knowledge_docs` + `rr_ai_search_docs` (FTS)
- Fireflies webhook maps/events
- `business_type_packs` + `workspace_provision_requests`
- `tenant_app_identities`
- Industry pack `manifest.templates` seeds (eng/construction/trading)

**Edge**
- `hm-ai-gateway`, `fireflies-webhook`, `hm-provision-workspace` (`verify_jwt = false` + in-function guards)

**Tests**
- `supabase/tests/modules/marketing_test.sql`, `ai_retrieval_test.sql`, `app_identity_test.sql`, `industry_packs_templates_test.sql`


## M13 — `20261301120000` … `20261301140000`

**What**
- `dsr_requests`, `retention_runs`, `rr_retention_run`, `rr_dsr_anonymize_contact`, soft-delete columns on accounts/contacts
- `rate_limit_buckets` + `rr_rate_limit_hit` (service_role)
- Unique `(tenant_id, source_type, source_id)` on non-void GL journals for auto-post drafts

**Tests**
- `dsr_retention_test.sql`, `rate_limit_test.sql`

