# RRCRM status

**Last updated:** 14 November 2026 (Asia/Dubai)  
**Current milestone:** Overnight backlog — morning merge queue (post-#301)

## Morning merge order (agent cannot merge)

**Merged:** #301 (Zod call notes). Prefer this order so STATUS conflicts stay small:

1. **#161** — Drop DRAFT banner from proforma invoices  
2. **#212** — Catch-up tenant isolation CI fix  
3. **#302** — M3 Pipeline inventory metrics + board digest  
4. **#303** — Zod Pipeline next-step patch *(stacked on #302)*  
5. **#305** — Zod build blocker notes  
6. **#306** — Zod legal sign + quote accept  
7. **#307** — Zod vault NDA signer  
8. **#308** — Zod ticket reply  
9. **#309** — Zod account contact + timeline note  
10. **#310** — Zod insights capacity  
11. **#311** — Zod CRM Won/Lost outcome  
12. **#312** — Zod Wanders deal + terms  
13. **#313** — Zod invoice payment  
14. **#314** — Zod Supabase connect  
15. **#316** — Zod quotation finalize  
16. **#317** — Zod delivery note from quote  
17. **#318** — Zod ticket AI summary note  
18. **#319** — Zod Wanders tour-ops booking link  
19. **#320** — Zod expense supplier PDF pick  
20. **#321** — CRM Guide day-to-day content pack  
21. **#322** — Cmd/Ctrl+K command palette  
22. **#323** — event_outbox enqueue from activity log  
23. **#315** — this STATUS (merge last, or skip if another PR already refreshed STATUS)

If a PR shows a STATUS-only conflict after an earlier merge, keep **this PR’s** milestone block.

## Shipped this turn

- Restacked open PRs onto main after #301; morning merge-order refreshed

## Already on main

- Through #301 (Zod call notes) · M0–M4 · M3 façade notes · QTSP · `pipeline_deals_v` · M5 spawn-on-sign

## Still open (agent queue)

1. Merge the green queue above  
2. Demo env hooks after Alfred provisions M3a  

## Still externally blocked

- CASA · logos · §19 · paid QTSP · M3a Supabase (Alfred)  
- Destructive CRM table merge (needs explicit approve)  
