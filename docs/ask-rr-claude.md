# Ask RR in Claude (Mac + iPhone)

Ask RR in RR Central covers Sales CRM pages in the browser. To use the same
tools from **Claude Desktop**, **claude.ai**, and **Claude on iPhone**, add a
remote MCP connector.

## What you get

| Tool | Purpose |
| --- | --- |
| `ask_rr` | Pipeline / follow-up answers; may propose a draft quote |
| `find_quotations` | Look up quotes for a company (with app links) |
| `create_draft_quotation` | Save a **Draft** only (never Finalized) |

## One-time setup

1. Create a long random token (password manager).
2. In Supabase → Edge Functions → Secrets, add:
   - `ASK_RR_MCP_TOKEN` = that token  
   - `ANTHROPIC_API_KEY` (already required for in-app Ask RR)
3. Deploy the function: GitHub → Actions → **Deploy Edge Functions** → `ask-rr-mcp`.
4. Copy your project URL and **anon** key (Settings → API).

MCP URL:

`https://<PROJECT_REF>.supabase.co/functions/v1/ask-rr-mcp`

## Connect Claude (Mac / web)

1. Claude → **Customize → Connectors** → **Add** → **Custom** → **Web**.
2. Name: `Ask RR`.
3. URL: the MCP URL above.
4. Authentication: **No sign in**.
5. Request headers:
   - `apikey` = Supabase **anon** key (gateway requirement)
   - `Authorization` = `Bearer <ASK_RR_MCP_TOKEN>`  
     (or `x-ask-rr-token` = the token)
6. Save, enable the connector on a chat, then ask e.g. “Do we have a quote for Mass Allied?”

## iPhone

Connectors sync from your Claude account. Add the connector on Mac or
claude.ai first, then open the Claude iOS app and sign in with the same
account. Enable **Ask RR** from the chat connectors menu.

## Security

- The token can read CRM/quotations and create **Draft** quotations. Treat it
  like a shared sales secret; rotate it in Supabase if it leaks.
- Prefer reviewing Claude’s tool approvals before “Allow always”.
- Team / Enterprise: Owners add the connector; members connect individually.
