# Public REST API + webhooks (M11)

**Date:** 15 November 2026 (Asia/Dubai)

## Auth

- Edge Function `public-api` (`verify_jwt = false`)
- Caller sends `x-api-key: hm_…` (plaintext shown once at create time; only SHA-256 hash stored)
- Scopes on `api_keys.scopes` (JSON array). Wildcard `*` allowed.
- Default scopes (read-only): `read:accounts`, `read:invoices`, `read:quotations`
- Opt-in write scopes: `write:accounts`, `write:invoices`, `write:quotations` (checkboxes on `/public-api`)

## Routes

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| GET | `/functions/v1/public-api` | — | Health + route list |
| GET | `/v1/me` | any valid key | Key metadata |
| GET | `/v1/accounts` | `read:accounts` | Tenant-scoped; `?limit=&cursor=` |
| POST | `/v1/accounts` | `write:accounts` | Create account; emits `account.created` |
| PATCH | `/v1/accounts/:id` | `write:accounts` | Update; emits `account.updated` |
| GET | `/v1/invoices` | `read:invoices` | Tenant-scoped; cursor pagination |
| POST | `/v1/invoices` | `write:invoices` | Create draft invoice; emits `invoice.created` |
| PATCH | `/v1/invoices/:id` | `write:invoices` | Update; emits `invoice.updated` |
| GET | `/v1/invoices/:id/lines` | `read:invoices` | Line items for the invoice reference |
| POST | `/v1/invoices/:id/lines` | `write:invoices` | Append a line item |
| POST | `/v1/invoices/:id/finalize` | `write:invoices` | Sets status `Sent` |
| GET | `/v1/quotations` | `read:quotations` | Tenant-scoped; cursor pagination |
| POST | `/v1/quotations` | `write:quotations` | Create draft quotation; emits `quotation.created` |
| PATCH | `/v1/quotations/:id` | `write:quotations` | Update; emits `quotation.updated` |
| GET | `/v1/quotations/:id/lines` | `read:quotations` | Line items for the quote reference |
| POST | `/v1/quotations/:id/lines` | `write:quotations` | Append a line item |
| POST | `/v1/quotations/:id/finalize` | `write:quotations` | Sets status `Finalized` |

Cursor = last row `id` from the previous page. Response shape: `{ data, next_cursor }`.

### Account write body

`name` (required on create), `type` (`ai_crm_client` \| `worship_church` \| `ctrm_prospect`), `reference`, `status`, `industry`, `country`, `city`, `website`, `notes`, `source`.

### Invoice write body

`client` (required on create), `reference_number`, `status` (default `Draft`), `payment_status` (default `Unpaid`), `amount` (≥ 0, default `0`), `currency` (default `AED`), `date` (`YYYY-MM-DD`), `description`, `notes`.

### Quotation write body

`client` (required on create), `reference_number`, `status` (default `Draft`), `amount` (≥ 0, default `0`), `currency` (default `AED`), `date` (`YYYY-MM-DD`), `description`, `notes`, `deal_ref`.

### Line item write body

`description` (required), `qty` (default `1`), `unit_price` / `amount`, `vat_rate` (default `0.05`), `sku`, `remarks`, `line_no`.

## Webhooks

Admin UI `/public-api` stores `webhook_endpoints` with a `whsec_…` secret.

Deliveries (test, account/invoice/quotation events, retries) sign the body:

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

## Ops / demo

- Handler wrapped with `withErrorLog("public-api", …)` (error log + `installDemoGuard`)
- Demo env still dry-runs webhook emit via `isDemoEnv()`

## Not in this slice

- PDF generation via API
- OpenAPI codegen
- Partner-facing delivery guarantee SLAs
