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
| Spawn on sign | `legal-sign` opens default obligations when a doc is signed |
| Clause-tag spawn | Template `<!-- rr-clause:key -->` markers drive extra duties |
| TDRA QTSP integration | **Phase B scaffold** in `app/src/lib/esign/` — stub only until licensed vendor |

## Slice 8 (clause-tag spawn)

- Clause inserts stamp `<!-- rr-clause:key -->` markers
- On sign: read linked template body → match keys → spawn keyed obligations (+ defaults)
- Unit tests for key detection and keyed spawn rules

## Phase B scaffold (unlocked)

- `currentCanvasEsignLevel()` always returns `assent_capture`
- `getQtspProvider` / `createQtspSigningSession` refuse to run without a configured TDRA-licensed QTSP
- Settings key `esignQtspProvider` reserved; options are “none” or “pending vendor”
- **No** QES/AdES claim on the canvas path; **no** paid vendor wired yet

## Later

1. Alfred picks a TDRA-licensed QTSP → wire real adapter + secrets (ask before paid sub)
2. Settings UI to select the live vendor once credentials exist
3. Route high-stakes doc types through QTSP when counsel requires AdES/QES

## Ops

1. Apply `contract_obligations` migration if not already
2. Redeploy `legal-sign` after spawn-related merges

## Rules

- Do not break the existing NDA vault / `/sign` path
- Do not claim QES without a TDRA-licensed QTSP
- Ask before new paid services
