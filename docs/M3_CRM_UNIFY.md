# M3 — CRM unify

**Goal:** One sales hub of record without breaking My Day `/crm` briefing or CTRM commissions.

## Models today (keep until retired)

| Pipeline | Table | List UI | Account link |
|----------|-------|---------|--------------|
| CRM (My Day) | `crm` | `/crm` | Optional `account_id` |
| AI CRM sales | `sales_deals` | `/sales` | Required `account_id` |
| CTRM Next | `ctrm_deals` | `/ctrm` | Required `account_id` |

`/deals` boards all three via `myDeals.ts` (read adapter) and writes through `myDealsStore` (`moveMyDeal` / `patchMyDeal`).

## Slice 1 (done)

- Pass `crm.account_id` through `/deals` rows
- Linked CRM deals open `/accounts/:id` (sheet still available via “Open sheet”)
- Unlinked CRM deals stay on `/crm?edit=`
- Docs only — **no** table merge / drops

## Slice 2 (done)

- `planCrmAccountBackfill` / `applyUniqueCrmAccountLinks` — unique soft-match only
- `/deals` nudge banner: link unique matches; open CRM for ambiguous / none
- Per-deal CRM sheet linker unchanged (create account / open / view matches)
- **No** create-all, **no** table merge / drops

## Slice 3 (this milestone step)

- Write façade: `moveMyDeal` (stage) + `patchMyDeal` (next step / owner)
- `/deals` next-step click → shared modal; routes to native tables
- CRM owner maps `owner_user_id` → free-text `owner` name
- Native `/crm` `/sales` `/ctrm` pages keep their own forms
- **No** table merge / drops

## Later slices (not yet)

1. Retire duplicate list pages / schema consolidate (**ask before destructive SQL**)

## Rules

- Do not break §B.3 RR Central workflows during M3
- M3a demo project is a separate ask (Alfred)
