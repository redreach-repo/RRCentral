Status: built and tested (draft)
Owner: Claude
PR: see the PR titled "Public REST API + webhooks" (draft)
Stubbed / unverified: never run against a real Supabase project (tested on local Postgres + Deno only); read-only v1 (no write endpoints yet); no per-key rate limit beyond Supabase's own; the webhook SSRF guard checks the URL, not DNS; webhook secrets are stored in plain text readable by the service role only (to move under Field-level encryption); Arabic labels need review.

# Public REST API + webhooks

## For Alfred: setup (nothing is applied yet)
1. Merge #414, then this PR.
2. SQL copy page: run `supabase/migrations/20261221090000_public_api_webhooks.sql` (safe to re-run).
3. Supabase secret: `WEBHOOK_CRON_SECRET` (any long random text) — only if you want webhooks.
4. Actions → Deploy Edge Functions → Function `other`, type `hm-public-api`. Again for `hm-webhook-dispatch` if you want webhooks.
5. Schedule the webhook sender (SQL copy page, after step 3; replace the two placeholders):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('hm-webhook-dispatch', '* * * * *', $$
     select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/hm-webhook-dispatch',
       headers := jsonb_build_object('x-cron-secret', '<WEBHOOK_CRON_SECRET>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb)
   $$);
   ```
6. In the app: **Developers → API keys and webhooks** (admins only).

## API reference (v1, read only)

Base URL: `https://<project>.supabase.co/functions/v1/hm-public-api/v1`
Auth: `Authorization: Bearer hm_<64 hex>`. Keys are made by an admin, shown once, stored only as a SHA-256 hash, scoped, optionally expiring, revocable.

| Method + path | Scope | Returns |
|---|---|---|
| `GET /v1` | any | `{ version, resources }` the key can read |
| `GET /v1/accounts` | `accounts:read` | `{ data: Account[], next_cursor }` |
| `GET /v1/accounts/{id}` | `accounts:read` | `{ data: Account }` |
| `GET /v1/invoices`, `/v1/invoices/{id}` | `invoices:read` | Invoice(s) |
| `GET /v1/quotations`, `/v1/quotations/{id}` | `quotations:read` | Quotation(s) |

Lists: newest first, `?limit=1..200` (default 50), `?cursor=<next_cursor>`.

Fields returned (nothing else ever leaves, see `RESOURCES` in `supabase/functions/hm-public-api/lib.ts`):
- Account: id, type, name, reference, industry, country, city, website, status, source, created_at, updated_at
- Invoice: id, account_id, client, reference_number, date, description, amount, currency, status, payment_status, payment_terms, created_at, updated_at
- Quotation: id, account_id, client, reference_number, revision, date, valid_until, description, amount, discount_amount, currency, status, created_at, updated_at

Internal notes, supplier costs, margins, pay links, contact details and tenant ids are never exposed.

Errors: `{ "error": { "code", "message" } }` with 401 `missing_api_key` / `invalid_api_key` / `revoked_api_key` / `expired_api_key`, 403 `insufficient_scope`, 404 `not_found`, 400 `bad_cursor`, 405 `method_not_allowed`, 503 `unavailable`.

## Webhooks

Every row added to `event_outbox` (quote finalised, invoice paid, CRM changes, …) becomes one delivery per matching active endpoint of the same tenant. An endpoint subscribes to a list of event types, or `*` for all.

POST body:
```json
{ "id": "<event id>", "type": "mark_paid", "aggregate_type": "invoice", "aggregate_id": "...", "created_at": "...", "data": { } }
```
Headers: `HighMast-Event`, `HighMast-Delivery` (delivery id, use it to ignore duplicates), `HighMast-Signature: t=<unix>,v1=<hex>` where `v1 = HMAC-SHA256(secret, "<t>.<raw body>")`. Verify in constant time and refuse `t` older than 5 minutes (reference: `verifySignature` in `supabase/functions/hm-webhook-dispatch/lib.ts`).

Any 2xx = delivered. Otherwise retried after 1, 2, 4 … minutes (max 1 hour gap); after 8 failures the delivery is `dead`. Redirects are not followed. https only; localhost and private IP addresses are refused.

The signing secret (`whsec_…`) is shown once when the webhook is added. App users cannot read it afterwards (column grants); only the service role sender can.

## Access

| | admin | manager | sales | staff | viewer | other tenant | anon |
|---|---|---|---|---|---|---|---|
| API keys (metadata) | read, create, revoke | – | – | – | – | – | – |
| Key hash / webhook secret | never | never | never | never | never | never | never |
| Webhook endpoints | manage | – | – | – | – | – | – |
| Delivery log | read | – | – | – | – | – | – |
| Run the sender by hand | yes | yes | – | – | – | – | – |

## Tests
- `supabase/tests/modules/public_api_test.sql`: key create/format/scopes/hash/revoke, secrets unreadable, audit redaction, fan out (filter, wildcard, tenant), claim/backoff/dead letter, every role, tenant B, anon.
- `supabase/tests/functions/hm_public_api_test.ts`: routes, key checks, scopes, no internal fields, cursors (incl. injection attempt), signatures, SSRF guard, both functions refuse bad callers.
- `app/src/lib/publicApi/publicApi.test.ts`.
