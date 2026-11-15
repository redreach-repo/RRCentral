# Public REST API + webhooks (M11)

**Date:** 15 November 2026 (Asia/Dubai)

## Auth

- Edge Function `public-api` (`verify_jwt = false`)
- Caller sends `x-api-key: hm_…` (plaintext shown once at create time; only SHA-256 hash stored)
- Scopes on `api_keys.scopes` (JSON array). Wildcard `*` allowed.
- Default scopes (read-only): `read:accounts`, `read:invoices`, `read:quotations`
- Opt-in write scope: `write:accounts` (checkbox on `/public-api`)

## Routes

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| GET | `/functions/v1/public-api` | — | Health + route list |
| GET | `/v1/me` | any valid key | Key metadata |
| GET | `/v1/accounts` | `read:accounts` | Tenant-scoped; `?limit=&cursor=` |
| POST | `/v1/accounts` | `write:accounts` | Create account; emits `account.created` webhook |
| PATCH | `/v1/accounts/:id` | `write:accounts` | Update allowed fields; emits `account.updated` |
| GET | `/v1/invoices` | `read:invoices` | Tenant-scoped; cursor pagination |
| GET | `/v1/quotations` | `read:quotations` | Tenant-scoped; cursor pagination |

Cursor = last row `id` from the previous page. Response shape: `{ data, next_cursor }`.

### Account write body

`name` (required on create), `type` (`ai_crm_client` \| `worship_church` \| `ctrm_prospect`), `reference`, `status`, `industry`, `country`, `city`, `website`, `notes`, `source`.

## Webhooks

Admin UI `/public-api` stores `webhook_endpoints` with a `whsec_…` secret.

Deliveries (test, account events, retries) sign the body:

- `X-HighMast-Event`
- `X-HighMast-Timestamp` (unix seconds)
- `X-HighMast-Signature: t=<ts>,v1=<hmac-sha256-hex of "${ts}.${body}">`

Failed deliveries set `next_retry_at` and bump `delivery_failures`.

### Background retry worker

Edge Function `webhook-retry` (`verify_jwt = false`):

- Auth: `x-cron-secret` = `WEBHOOK_CRON_SECRET` or `OUTBOX_CRON_SECRET`
- POST drains up to 25 active endpoints with `next_retry_at <= now`
- HMAC-signs a `highmast.retry` payload; backs off 1m / 5m / 15m; stops after 8 failures

Schedule example (pg_cron / external):

```
POST /functions/v1/webhook-retry
Header: x-cron-secret: <secret>
```

## Not in this slice

- Invoice/quotation writes
- OpenAPI codegen
- Partner-facing delivery guarantee SLAs
