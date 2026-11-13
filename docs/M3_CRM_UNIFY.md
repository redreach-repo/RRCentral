# M3 — CRM unify

**Goal:** One sales hub of record without breaking My Day `/crm` briefing or CTRM commissions.

## Models today (keep until retired)

| Pipeline | Table | List UI | Account link |
|----------|-------|---------|--------------|
| CRM (My Day) | `crm` | `/crm` | Optional `account_id` |
| AI CRM sales | `sales_deals` | `/sales` (detail) | Required `account_id` |
| CTRM Next | `ctrm_deals` | `/ctrm` (detail) | Required `account_id` |

`/deals` (**Pipeline**) boards all three via `myDeals.ts` and writes through `myDealsStore` (`moveMyDeal` / `patchMyDeal`).

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

## Slice 3 (done)

- Write façade: `moveMyDeal` (stage) + `patchMyDeal` (next step / owner)
- `/deals` next-step click → shared modal; routes to native tables
- CRM owner maps `owner_user_id` → free-text `owner` name
- Native `/crm` `/sales` `/ctrm` pages keep their own forms
- **No** table merge / drops

## Slice 4 (this milestone step) — soft-retire lists

- Nav: **Pipeline** first under Sales · Work; `/sales` / `/ctrm` relabeled **AI CRM detail** / **CTRM detail**
- Prefer-Pipeline banners on detail boards; My Day hero links to Pipeline
- Routes and tables kept — **no** redirects that break bookmarks, **no** schema drops

## Later (unlocked — still careful)

1. Schema consolidate / drop duplicate list routes — **unlocked**, but still **no destructive SQL** until a dedicated migrate PR with dual-write + cutover plan
2. M3a demo project — prep in `docs/M3A_DEMO.md`; **Alfred provisions** the Supabase project

## Rules

- Do not break §B.3 RR Central workflows during M3
- M3a demo project is a separate ask (Alfred)
