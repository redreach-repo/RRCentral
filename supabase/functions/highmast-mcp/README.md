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
* **No delete tools**, and no tools for HR, payroll, salaries, IBAN, ID or
  passport data, secrets, settings or users.
* **60 calls a minute per key**, counted in the database.
* **Audit log:** every tool call is in Admin > Audit log as *AI tool call*,
  with the key name, the tool, its arguments and whether it worked. Records the
  AI adds or changes also show there under the member's email.

Tests: `supabase/tests/modules/highmast_mcp_test.sql` (database: a sales key
cannot read HR or payroll and cannot delete anything),
`supabase/tests/functions/highmast_mcp_test.ts` (function), and
`app/src/lib/highmastMcp.test.ts` (rules).
