Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: partial receipt against client PO, hard invoice enforcement

## What it does

Tracks client-issued POs against CRM accounts (number, amount, status). Soft-matches invoices by amount (±5%) into `invoice_id` and updates status to partial/fulfilled. Sales/ops document tracker — not supplier purchasing.

## Roles

- Staff: CRUD client POs

## Tables

- `client_purchase_orders`

## Alfred

Apply `20261230180000_client_purchase_orders.sql`.
