# M5 — Contracts and e-sign

**Goal:** Clause library, obligations board, and honest e-sign levels under UAE Decree-Law 46/2021 — without over-claiming today’s canvas signature.

## Today

| Capability | Implementation |
|------------|----------------|
| NDA vault + send link | Exists (`legal-documents.md`, `/sign`, `legal-sign`) |
| Canvas assent capture | Exists — **not** AdES/QES; client copy states this |
| Clause library | `/clause-library` CRUD |
| Compose into templates | Insert active clauses into NDA + agreement draft editors |
| Obligations board | `/obligations` |
| Spawn on sign | `legal-sign` opens default obligations when a doc is signed |
| TDRA QTSP integration | Not started → Phase B after ask |

## Slice 6 (this milestone step)

- `defaultObligationsOnSign` helper + unit tests (bundled into `legal-sign`)
- After successful sign: insert default open obligations (idempotent per document)
- Signing still succeeds if the obligations table is missing

## Later

1. Richer spawn rules / clause tags
2. Phase B QTSP after Alfred approves a licensed vendor

## Ops

1. Apply `contract_obligations` migration if not already
2. Redeploy `legal-sign` after merge

## Rules

- Do not break the existing NDA vault / `/sign` path
- Do not claim QES without a TDRA-licensed QTSP
- Ask before new paid services
