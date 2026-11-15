Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: Sentry DSN, data residency, passkey enroll, VAT filing, GL tax mapping

## What it does

- DSR request log + retention prune wrapper + contact anonymize RPC
- Rate-limit buckets + `rr_rate_limit_hit` (public-api adopts)
- Static `_headers` + Edge `securityHeaders`
- `listIo` CSV framework (Accounts export)
- Invoice → draft GL auto-post stub (Unverified)
- VAT return CSV stub + passkey stub card

## Alfred

Apply `20261301120000`–`140000`. Optional: set Sentry DSN (still off by default). No new paid services required for this slice.
