# M5 — Contracts and e-sign

**Goal:** Clause library, obligations board, and honest e-sign levels under UAE Decree-Law 46/2021 — without over-claiming today’s canvas signature.

## Today

| Capability | Implementation |
|------------|----------------|
| NDA vault + send link | Exists (`legal-documents.md`, `/sign`, `legal-sign`) |
| Canvas assent capture | Exists — **not** AdES/QES; client copy states this |
| Clause library | Foundation table + `/clause-library` CRUD |
| Obligations board | Missing → next |
| TDRA QTSP integration | Not started → Phase B after ask |

## Slice 3 (this milestone step)

- Migration `contract_clauses` (RLS: staff read, managers edit) + seed clauses
- Zod form + store + `/clause-library` page + Delivery nav link
- **No** template composition yet; **no** QTSP

## Later

1. Compose clauses into NDA / agreement drafts
2. Obligations board
3. Phase B QTSP after Alfred approves a licensed vendor

## Ops

1. Apply `supabase/migrations/20261214090000_contract_clauses.sql`

## Rules

- Do not break the existing NDA vault / `/sign` path
- Do not claim QES without a TDRA-licensed QTSP
- Ask before new paid services
