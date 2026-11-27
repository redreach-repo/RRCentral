# Sales see only their own clients (Sales lockdown, PR 1)

Migration: `supabase/migrations/20261332090000_sales_own_clients.sql`
Test: `supabase/tests/modules/sales_own_clients_test.sql`
App list of switches: `app/src/lib/userPermissions.ts`

## The rule

A user with the **Sales** role reaches only their own clients and none of the
company's money. Admin, manager, staff and viewer are unchanged.

| What | A Sales user reaches |
| --- | --- |
| Accounts (Clients and contacts) | Accounts they own (`owner_user_id`) |
| Leads (My Day, `crm`) | Leads whose owner is their name or email, and unassigned leads they added |
| Clients list (`clients`) | Clients linked to their account, named like their account or lead, or added by them |
| Quotations | Quotes they made, quotes for their clients, and anyone's revision of those |
| Invoices | Invoices they made, for their clients, or made from their quote (same reference) |
| Delivery notes, document lines | Of their own quotes, invoices and Client POs |
| Client POs, PO drawdowns, uniforms | Of their clients, quotes or invoices |
| Projects (`delivery_projects`) | Projects they are added to (`delivery_project_members`) or on an account they own, read only |
| Income | Rows of their own invoices (the invoice screen keeps income in step) |
| Payments (`payment_log`, `customer_payments`) | Of their own invoices, read only |
| Expenses, vendors, supplier side, purchase orders, project costs, chasing, refunds, contract invoices, stock moves, goals, usage | Nothing |

Contracts, sales deals, CTRM deals and tickets follow `rr_can_read_account` /
`rr_can_write_account`, which now apply the same own-accounts rule to Sales.

They can still: add leads (owned by them or unassigned), add clients, make
quotes, invoices, delivery notes and Client POs for their clients, get
company-wide reference numbers. They cannot reassign or delete (unchanged).

## Per-person switches (`user_permissions`)

| Key | Opens |
| --- | --- |
| `clients.view_all` | Read every client, lead and account. No editing of others' records |
| `finance.company` | Lifts the lock: the Sales access from before this migration |
| `quotes.margin` | For the screens (PR 2): show supplier cost and margin |
| `export.csv` | For the screens (PR 2): CSV download buttons |
| `ai.connector` | For the screens (PR 3): allow an AI connector key |

Only admins switch them. `granted_by` comes from the session. Every change is in
the audit log. The AI connector can never write them.

## How it is built

Restrictive RLS policies named `Sales lock (read|add|change|remove)` on each
table, ANDed with the existing ones. They only bite when
`rr_sales_locked()` is true (role `sales` and no `finance.company`). The
"which records are theirs" lists come from security-definer helpers
(`rr_sales_client_keys()`, `rr_sales_quote_ids()`, `rr_sales_doc_refs()` ...),
wrapped in `(select ...)` so each runs once per query.

## Not in this PR

- Screens: Finance pages and CSV buttons still show for Sales (with fewer or no
  rows), Home money cards show only their own invoices' income, the switches
  have no screen yet (set them in SQL until PR 2).
- Supplier cost and margin on their own quotes and lines are still visible to
  them (moving cost to its own table is a later PR).
- Viewer still reads everything, including money.
