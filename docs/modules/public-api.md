# Public REST API + webhooks (M11)

**Date:** 15 November 2026 (Asia/Dubai)

## Auth

- Edge Function `public-api` (`verify_jwt = false`)
- Caller sends `x-api-key: hm_…` (plaintext shown once at create time; only SHA-256 hash stored)
- Scopes on `api_keys.scopes` (JSON array). Wildcard `*` allowed. Defaults: `read:accounts`, `read:invoices`, `read:quotations`

## Routes

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| GET | `/functions/v1/public-api` | — | Health + route list |
| GET | `/v1/me` | any valid key | Key metadata |
| GET | `/v1/accounts` | `read:accounts` | Tenant-scoped; `?limit=&cursor=` |
| GET | `/v1/invoices` | `read:invoices` | Tenant-scoped; cursor pagination |
| GET | `/v1/quotations` | `read:quotations` | Tenant-scoped; cursor pagination |

Cursor = last row `id` from the previous page. Response shape: `{ data, next_cursor }`.

## Webhooks

Admin UI `/public-api` stores `webhook_endpoints` with a `whsec_…` secret.

Test delivery (and future workers) sign the body:

- `X-HighMast-Event`
- `X-HighMast-Timestamp` (unix seconds)
- `X-HighMast-Signature: t=<ts>,v1=<hmac-sha256-hex of "${ts}.${body}">`

Retries: up to 3 attempts on network errors / HTTP 429 / 5xx (`app/src/lib/publicApi.ts`). Failures bump `delivery_failures` and set `next_retry_at`; each attempt can be logged in `webhook_delivery_attempts`.

## Not in this slice

- Write endpoints
- OpenAPI codegen
- Background retry worker draining `next_retry_at`
