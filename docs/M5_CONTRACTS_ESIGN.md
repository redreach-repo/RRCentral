# M5 — Contracts and e-sign

**Goal:** Clause library, obligations board, and honest e-sign levels under UAE Decree-Law 46/2021 — without over-claiming today’s canvas signature.

## Today

| Capability | Implementation |
|------------|----------------|
| NDA vault + send link | Exists (`legal-documents.md`, `/sign`, `legal-sign`) |
| Canvas assent capture | Exists — **not** AdES/QES; client copy states this |
| Clause library | `/clause-library` CRUD |
| Compose into templates | Insert active clauses into NDA + agreement draft editors |
| Obligations board | `/obligations` — open/done/cancelled follow-through |
| Vault obligations | CRM Contracts tab: list / quick-add / mark done |
| Spawn on sign | [#244](https://github.com/redreach-repo/RRCentral/pull/244) (open) — default rows after `/sign` |
| TDRA QTSP integration | Not started → Phase B after ask |

## Slice 7 (this milestone step)

- Contracts vault panel: open obligations for the company + quick-add + mark done
- Link to full `/obligations` board

## Later

1. Merge spawn-on-sign (#244) + richer spawn rules
2. Phase B QTSP after Alfred approves a licensed vendor

## Ops

1. Apply `20261214100000_contract_obligations.sql`

## Rules

- Do not break the existing NDA vault / `/sign` path
- Do not claim QES without a TDRA-licensed QTSP
- Ask before new paid services
