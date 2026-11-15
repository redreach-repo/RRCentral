# Run plan — Batch M13 Hardening + compliance

**Started:** 15 November 2026 (Asia/Dubai)  
**Branch:** `cursor/batch-m13-hardening-d3d5` (from `main`)  
**Spec:** Master Spec v2.1  
**Note:** M10–M12 PR #439 may still be open; this batch does not depend on it.

---

## M13 slices

- [x] DSR requests + retention prune wrappers (access uses clientExport; erasure = anonymize stub)
- [x] Shared Edge/Postgres rate-limit buckets
- [x] Security headers (`_headers` + Edge helper)
- [x] List import/export framework (`listIo`) on Accounts/Vendors CSV export
- [x] GL auto-post stub (invoice → draft journal; Unverified)
- [x] VAT return CSV stub (Unverified) + passkey MFA stub card
- [ ] Sentry DSN / residency / CASA / QTSP / WPS counsel (Not done — external)

## Quality gates

- [x] typecheck / lint / vitest / SQL module tests
