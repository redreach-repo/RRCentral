# M5 — Contracts and e-sign

**Goal:** Clause library, obligations board, and honest e-sign levels under UAE Decree-Law 46/2021 — without over-claiming today’s canvas signature.

## Today

| Capability | Implementation |
|------------|----------------|
| NDA vault + send link | Exists (`legal-documents.md`, `/sign`, `legal-sign`) |
| Canvas assent capture | Exists — **not** AdES/QES; client copy states this |
| Clause library / obligations | Missing → next slices |
| TDRA QTSP integration | Not started → Phase B after ask |

## Slice 2 (this milestone step)

- `/sign` + vault/template copy audit: assent / signing-record language; explicit **not QES**
- Shared blurb constants + unit test in `legalDocuments`
- **No QTSP code**

## Later

1. Clause library + obligations board (product)
2. Phase B QTSP integration after Alfred approves a licensed vendor

## Rules

- Do not break the existing NDA vault / `/sign` path
- Do not claim QES without a TDRA-licensed QTSP
- Ask before new paid services
