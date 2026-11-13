# RRCRM status

**Last updated:** 14 November 2026 (Asia/Dubai)  
**Current milestone:** Overnight backlog — morning merge queue ready

## Morning merge order (agent cannot merge)

Merge green PRs bottom-up. Prefer this order so STATUS conflicts stay small:

1. **#161** — Drop DRAFT banner from proforma invoices  
2. **#212** — Catch-up tenant isolation CI fix  
3. **#301** — Zod call notes  
4. **#302** — M3 Pipeline inventory metrics + board digest  
5. **#303** — Zod Pipeline next-step patch  
6. **#305** — Zod build blocker notes  
7. **#306** — Zod legal sign + quote accept  
8. **#307** — Zod vault NDA signer  
9. **#308** — Zod ticket reply  
10. **#309** — Zod account contact + timeline note  
11. **#310** — Zod insights capacity  
12. **#311** — Zod CRM Won/Lost outcome  
13. **#312** — Zod Wanders deal + terms  
14. **#313** — Zod invoice payment  
15. **#314** — Zod Supabase connect  
16. **#315** — this STATUS (merge near the end, or skip if another PR already refreshed STATUS)  
17. **#316** — Zod quotation finalize  
18. **#317** — Zod delivery note from quote
19. **#318** — Zod ticket AI summary note  
20. **#319** — Zod Wanders tour-ops booking link
21. **#320** — Zod expense supplier PDF pick

If a PR shows a STATUS-only conflict after an earlier merge, keep **this PR’s** milestone block.

## Shipped this turn

- Morning merge-order STATUS so wake-up merges are one list

## Already on main

- M0–M4 · M1 Zod backlog through delivery contracts · M3 façade notes · route soft-hide · QTSP · `pipeline_deals_v` · M5 spawn-on-sign

## Still open (agent queue)

1. Drain remaining M1 Zod form leftovers (PRs above)  
2. Demo env hooks after Alfred provisions M3a  

## Still externally blocked

- CASA · logos · §19 · paid QTSP · M3a Supabase (Alfred)  
- Destructive CRM table merge (needs explicit approve)  
