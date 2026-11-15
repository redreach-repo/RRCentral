Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: auto-match to invoices, partial receipt against client PO

## What it does

Tracks client-issued POs against CRM accounts (number, amount, status). Sales/ops document tracker — not supplier purchasing.

## Roles

- Staff: CRUD client POs

## Tables

- `client_purchase_orders`

## Alfred

Apply `20261230180000_client_purchase_orders.sql`.
