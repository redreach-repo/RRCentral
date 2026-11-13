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
| TDRA QTSP integration | Not started → Phase B after ask |

## Slice 5 (this milestone step)

- Migration `contract_obligations` (staff RLS) + Zod + store
- `/obligations` board with filters, overdue highlight, mark done
- **No** QTSP

## Later

1. Auto-create obligations from signed docs / clause tags
2. Phase B QTSP after Alfred approves a licensed vendor

## Ops

1. Apply `20261214100000_contract_obligations.sql`

## Rules

- Do not break the existing NDA vault / `/sign` path
- Do not claim QES without a TDRA-licensed QTSP
- Ask before new paid services
