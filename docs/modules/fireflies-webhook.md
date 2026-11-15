Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: production Fireflies dashboard webhook URL

## What it does

`fireflies-webhook` Edge accepts `x-fireflies-secret`, matches maps, inserts timeline meetings (deduped by external_id). Manual paste path (`fireflies-fetch`) unchanged.

## Alfred

Set `FIREFLIES_WEBHOOK_SECRET`, apply `20261230215000_fireflies_webhook.sql`, deploy function, register webhook URL.
