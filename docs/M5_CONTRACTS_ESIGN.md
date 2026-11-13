# M5 — Contracts and e-sign

**Goal:** Clause library, obligations board, and honest e-sign levels under UAE Decree-Law 46/2021 — without over-claiming today’s canvas signature.

## Today

| Capability | Implementation |
|------------|----------------|
| NDA vault + send link | Exists (`legal-documents.md`, `/sign`, `legal-sign`) |
| Canvas assent capture | Exists — **not** AdES/QES; client copy states this |
| Clause library | `/clause-library` CRUD |
| Compose into templates | Insert active clauses into NDA + agreement draft editors |
| Obligations board | Missing → next |
| TDRA QTSP integration | Not started → Phase B after ask |

## Slice 4 (this milestone step)

- `formatClauseForTemplate` / `insertTextAtCursor` helpers + tests
- NDA template + Agreement template: insert active clauses at cursor; link to library
- **No** QTSP; **no** obligations board yet

## Later

1. Obligations board
2. Phase B QTSP after Alfred approves a licensed vendor

## Rules

- Do not break the existing NDA vault / `/sign` path
- Do not claim QES without a TDRA-licensed QTSP
- Ask before new paid services
