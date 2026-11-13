# M3 — CRM unify

**Goal:** One sales hub of record without breaking My Day `/crm` briefing or CTRM commissions.

## Models today (keep until retired)

| Pipeline | Table | List UI | Account link |
|----------|-------|---------|--------------|
| CRM (My Day) | `crm` | `/crm` | Optional `account_id` |
| AI CRM sales | `sales_deals` | `/sales` | Required `account_id` |
| CTRM Next | `ctrm_deals` | `/ctrm` | Required `account_id` |

`/deals` already boards all three via `myDeals.ts` (adapter only; writes stay native).

## Slice 1 (this milestone step)

- Pass `crm.account_id` through `/deals` rows
- Linked CRM deals open `/accounts/:id` (sheet still available via “Open sheet”)
- Unlinked CRM deals stay on `/crm?edit=`
- Docs only — **no** table merge / drops

## Later slices (not yet)

1. Backfill linker coverage; nudge unlinked CRM → Accounts
2. Single write façade over the three tables
3. Retire duplicate list pages / schema consolidate (**ask before destructive SQL**)

## Rules

- Do not break §B.3 RR Central workflows during M3
- M3a demo project is a separate ask (Alfred)
