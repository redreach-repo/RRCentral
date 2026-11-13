# M3 — CRM unify

**Goal:** One sales hub of record without breaking My Day `/crm` briefing or CTRM commissions.

## Models today (keep until retired)

| Pipeline | Table | List UI | Account link |
|----------|-------|---------|--------------|
| CRM (My Day) | `crm` | `/crm` | Optional `account_id` |
| AI CRM sales | `sales_deals` | `/sales` (detail) | Required `account_id` |
| CTRM Next | `ctrm_deals` | `/ctrm` (detail) | Required `account_id` |

`/deals` (**Pipeline**) boards all three via `myDeals.ts` and writes through `myDealsStore` (`moveMyDeal` / `patchMyDeal`).

## Slice 1–4 (done)

Soft-retire lists, account link backfill, write façade — see git history. Routes and tables kept.

## Slice 5 — schema consolidate plan (unlocked, non-destructive first)

**Unlocked** for planning. **No DROP TABLE / route deletes in this slice.**

### Why not one table yet

| Concern | Detail |
|---------|--------|
| Shape mismatch | `crm` is company-centric My Day rows; `sales_deals` / `ctrm_deals` are account-linked deals with different stages |
| CTRM commissions | `ctrm_deal_commissions` must stay isolated from weekly summary |
| Fit sheet / sessions / terms | CTRM-only side tables keyed by account / deal |
| §B.3 workflows | Must keep My Day briefing, Pipeline board, native detail forms working |

### Cutover phases

1. **Inventory + invariants (docs/tests)** — assert every open deal has next action/date rules; CRM `account_id` coverage metrics
2. **Read model (done)** — SQL view `pipeline_deals_v` unions crm / sales_deals / ctrm_deals for reporting only (`security_invoker`, no commission, no writes)
3. **Dual-write experiment** — new deals created from Pipeline write native table only (already true); expand façade coverage for remaining CRM sheet fields
4. **Route soft-hide (done)** — Settings → Pipeline detail nav (`hidePipelineDetailNav=yes`) hides `/sales` `/ctrm` from non-admin sidebar; URLs kept
5. **Destructive merge** — **separate PR + explicit approve** before any `DROP` or forced redirects

### Explicitly deferred

- Dropping `crm` / `sales_deals` / `ctrm_deals`
- Redirecting `/crm` → `/deals` for bookmarks
- Merging commission columns into a shared deals table

## M3a

Prep: `docs/M3A_DEMO.md`. Alfred provisions the second Supabase project.

## Rules

- Do not break §B.3 RR Central workflows during M3
- No destructive SQL without a dedicated cutover PR
- M3a project credentials are an Alfred action
