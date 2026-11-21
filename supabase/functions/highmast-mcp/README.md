# HighMast MCP server (`highmast-mcp`)

Lets AI assistants such as **Grok Bot** use HighMast as a connector, over the
MCP **Streamable HTTP** transport (official `@modelcontextprotocol/sdk`,
TypeScript, stateless JSON mode).

## Server URL

```
https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/highmast-mcp
```

(Admin > **AI connector** shows the URL for whichever project the app is using.)
Every request needs the header `Authorization: Bearer <key>`.

## Set up (once)

1. **SQL.** Run `supabase/migrations/20261323090000_highmast_mcp.sql` in the
   Supabase SQL editor (copy: `supabase-sql/highmast-mcp.sql` in the project
   folder). Safe to re-run; changes no existing data.
2. **Secret.** Supabase > Project Settings > Edge Functions > Secrets: add
   `MCP_JWT_SECRET` = the project's JWT secret (Supabase > Project Settings >
   JWT Keys > *Legacy JWT secret*, press Reveal). The function uses it to sign a
   5 minute login token for the member a key acts as, so every query runs under
   that member's row level security. If the JWT secret is ever rotated, update
   this secret too.
3. **Deploy.** GitHub > Actions > **Deploy Edge Functions** > Run workflow >
   Function: `highmast-mcp`. (`verify_jwt = false` comes from `supabase/config.toml`;
   the function checks every key itself.)
4. **A member for the AI.** Settings > Users: add e.g. `grokbot@redreach.ae`,
   name "Grok Bot", role **sales** (any long password; nobody signs in with it).
   The AI then acts as that member, and its changes show under that name.

## Create a key

Admin > **AI connector** > New key: give it a name (it appears in the Audit
log), pick the member it acts as (only active **sales**, **staff** or
**viewer** members; admin and manager cannot be picked) and press **Create
key**. The key (`hmk_...`) is shown **once**; only its SHA-256 hash is stored.
**Revoke** stops a key at once. A key also stops working if its member is
switched off or given a different role.

## Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector: Transport **Streamable HTTP**, URL = the server URL above,
Authentication > Header name `Authorization`, value `Bearer hmk_...`. Press
Connect, then **Tools > List tools** (14 tools) and run e.g. `dashboard_summary`
or `list_deals` with `{"pipeline": "company"}`.

## curl

```bash
KEY=hmk_your_key_here
URL=https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/highmast-mcp

# List the tools
curl -s "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call one
curl -s "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_follow_ups_due","arguments":{"days_ahead":7}}}'
```

No key, a wrong key or a revoked key gets **401**; more than 60 calls in a
minute gets **429** with `Retry-After`.

## Tools

All answers are JSON. Lists take `limit` (1 to 50, default 20) and `offset`,
and return `items`, `has_more` and `next_offset`.

| Tool | What it does |
|---|---|
| `search_accounts(query, type)` | Find accounts by name or reference |
| `get_account(id)` | Account, contacts, open deals, open tickets, 20 latest timeline entries |
| `list_deals(pipeline, stage, owner)` | `company` (company CRM), `ai_crm` or `ctrm_next`; owner = `me`, a name or an email |
| `get_deal(id)` | Deal, account, 10 latest notes, CTRM stage history |
| `list_follow_ups_due(days_ahead)` | Follow-ups due (and overdue) across the three pipelines |
| `list_tickets(status, account_id)` / `get_ticket(id)` | Support tickets and their messages, with reply-time alerts |
| `list_quotes(status)` | Quotations (read only) |
| `list_invoices(status, overdue_only)` | Invoices (read only); overdue = unpaid past payment terms |
| `dashboard_summary()` | Overdue invoices, stale deals, tickets near their reply target, follow-ups due |
| `create_lead(company, contact_name, email, phone, title, source, pipeline, notes)` | Checks for an existing company (name without LLC/FZE etc., or contact email) and returns the match instead of a duplicate |
| `add_timeline_note(account_id or deal_id, text)` | Note on an account or a deal |
| `move_deal_stage(deal_id, stage)` | Forward only; never to won, lost or signed |
| `create_follow_up(deal_id, due_date, note)` | Sets the deal's next follow-up and logs it as a note |

## Keys by department (Grok Bot on Sales, Claude on HR ...)

Since `20261325090000_highmast_mcp_departments.sql`, each key also says which **assistant** it is for
(Grok Bot, Claude, ChatGPT or other) and a key with **Access: Departments** gets one or more departments:
Sales, Marketing, Finance, HR, Payroll, Operations, Support, Documents, or Admin (everything). Different
assistants can have different departments, and several keys can act as the same AI admin member.

* **Tools.** A key only lists the tools of its departments (`MCP_TOOL_DEPARTMENTS` in
  `app/src/lib/highmastMcp.ts`); the generic record tools list only the records it reaches.
* **Data.** Every public table has restrictive `MCP department reach` policies: a key reads and writes
  only the tables its departments list in `rr_mcp_table_departments()`. Quote and invoice lines follow
  their document. A table no department lists is for Admin only, so new tables start closed.
* **Audit.** Each change shows the key and assistant, e.g. `ai-assistant@redreach.ae (AI key: Sales, Grok Bot)`,
  and `new_data` holds `assistant` and `departments`.
* Everything below about admin keys still holds for every key with departments.

Setup: run `supabase-sql/highmast-mcp-departments.sql` (the admin and departments migrations in one
file), redeploy, then create keys on Admin > AI connector. Tests:
`supabase/tests/modules/highmast_mcp_departments_test.sql` and the "departments" mode of
`highmast_mcp_admin_db_test.ts` (every tool run with a key holding only its own department).

## Admin keys (every area)

A key with **Access: Admin** acts as a dedicated **AI Assistant** admin member and
gets 45 more tools on top of the 14 above. Set up once, after the steps above:

1. **SQL.** Run `supabase/migrations/20261324090000_highmast_mcp_admin.sql`
   (copy: `supabase-sql/highmast-mcp-admin.sql`). Safe to re-run; changes no existing data.
2. **Deploy** `highmast-mcp` again (GitHub > Actions > Deploy Edge Functions).
3. **Member.** Settings > Users: add `ai-assistant@redreach.ae`, name "AI Assistant",
   role **admin**. An admin key can never act as the admin who creates it.
4. Admin > **AI connector** > Access **Admin** > Acts as **AI Assistant** > Create key.

| Area | Tools |
|---|---|
| Any area | `list_records`, `get_record`, `create_record`, `update_record`, `delete_record` (soft), `restore_record` over 36 entities (accounts, contacts, deals, clients, client POs, quotes, invoices, payments, income, expenses, vendors, purchase orders, products, warehouses, stock, sites, build tasks, delivery projects and notes, time, contracts, ledger, tickets, documents, attachments, employees, leave, attendance, payroll, users) |
| CRM | `create_account`, `update_account`, `create_contact`, `update_contact`, `create_deal`, `update_deal`, `set_deal_stage` (any direction), `close_deal` (won / lost with reason) |
| Quotes | `get_quote`, `create_quote` (Draft, VAT 5%, AED, line discounts), `update_quote` (Draft only), `finalize_quote` (RR-XX-YYNNN), `mark_quote_sent`, `convert_quote_to_invoice` (full or deposit %) |
| Invoices and money | `get_invoice`, `create_invoice`, `update_invoice` (Draft only), `finalize_invoice`, `record_payment`, `reverse_payment`, `create_credit_note`, `create_expense`, `update_expense` |
| Support | `create_ticket`, `update_ticket`, `reply_ticket` (saved on the ticket, not emailed), `close_ticket` |
| Documents | `add_document` (link to a client or company document) |
| HR | `list_employees`, `get_employee` (salary and IBAN through HighMast's decryption), `create_employee`, `update_employee`, `create_leave_request`, `update_leave_request` |
| Payroll | `create_payroll_run`, `generate_payroll_lines`, `update_payroll_line`, `get_payroll_run` (draft only) |
| Admin | `list_users` (read only) |

**What an admin key still cannot do**, enforced in the database (`rr_mcp_guard`, the
`MCP ...` policies and the `rr_mcp_*` functions), not only here:

* **No hard deletes.** `delete_record` sets `deleted_at`; `restore_record` undoes it.
  (Replacing the lines of a Draft quote or invoice is the one delete, as in the app.)
* **Sent invoices and recorded payments never change.** Only the payment status
  moves. Corrections: `create_credit_note` ({invoice}-CN{n}, negative amount) or
  `reverse_payment` (a matching negative entry; the original stays).
* A quote that is no longer Draft only changes status (Sent, Awarded ...).
* **Payroll stays draft**: no approving, paying or voiding a run. **Leave** cannot be
  approved or rejected.
* No settings, secrets, keys, mail or Drive tokens; users are read only; numbering,
  pipelines and workflow setup cannot be changed.
* **Audit:** every change is an "AI change" (`MCP_WRITE`) row with the tool, its
  inputs, the record id and the record before and after; salary, IBAN and ID
  numbers are shown as `[hidden]`. Each call is also an "AI tool call" as before.

Same rules as the app: quote and invoice numbers come from `rr_allocate_reference`
(or the app's highest-number-plus-one fallback); line amounts round per line and
VAT is worked out on the document total, like `calcTotals`; converting a quote copies
its lines with the quote discount folded into the unit prices; invoices keep the
income ledger in step. Differences from the screens: lines get no catalogue SKU,
converting does not commit stock or draft a ledger journal, and quote validity is 14
days unless given (the app reads its own setting). Credit notes are new: HighMast had
none, so the Payments page does not net them against the original invoice's balance.

Tests: `supabase/tests/modules/highmast_mcp_admin_test.sql` (every database rule) and
`supabase/tests/functions/highmast_mcp_admin_db_test.ts` (every admin tool end to end on
a local database, rolled back afterwards; set `RR_TEST_PG_DB`).

## Safety

* **Runs as a member, under RLS.** Each key acts as one sales / staff / viewer
  member; the database's own rules decide what it can see and change. The
  service role key is never used for data (the shared error logger uses it only
  to record function crashes in App errors, as every function does).
* **Blocked in the database too** for any session carrying an AI key
  (`MCP ...` restrictive policies): no deletes on any table; no reading HR,
  payroll, settings, keys, mail tokens or the audit log; inserts only into
  accounts, contacts, timeline, CRM leads, follow-up notes and deals; updates
  only on CRM leads and deals. Quotes, invoices and payments cannot be written.
* **Standard keys: no delete tools**, and no tools for HR, payroll, salaries, IBAN,
  ID or passport data, secrets, settings or users. (Admin keys: see above.)
* **60 calls a minute per key**, counted in the database.
* **Audit log:** every tool call is in Admin > Audit log as *AI tool call*,
  with the key name, the tool, its arguments and whether it worked. Records the
  AI adds or changes also show there under the member's email.

Tests: `supabase/tests/modules/highmast_mcp_test.sql` (database: a sales key
cannot read HR or payroll and cannot delete anything),
`supabase/tests/functions/highmast_mcp_test.ts` (function), and
`app/src/lib/highmastMcp.test.ts` (rules).
