# AI help

RR Central uses Claude Haiku (`claude-haiku-5-5`) for four jobs. Nothing is
sent or saved without a person checking it first.

| Where | Button | What it does |
| --- | --- | --- |
| Ticket page | **Summarise** | Short summary of the thread: what the client wants, what was done, what is open. Can be saved as an internal note. |
| Ticket page | **Draft a reply** | Puts a draft reply in the reply box. Internal notes are used for context but never quoted. You edit it, send it as usual and log it. |
| Monthly report | **Write summary with AI** | Writes the opening summary from the report's numbers. You can edit it before printing. |
| AI CRM account, Requirements | **From call notes** | Paste call notes, get a list of suggested requirements, tick the ones to add. |

## Cost

Every request is logged in `ai_usage_log` against the account, with tokens
and cost in USD (Haiku costs about $0.10 per million input tokens and $0.50
per million output tokens, so a ticket summary is a fraction of a cent).
That cost is added to the client's tool cost in **Profitability this month**
and on the dashboard. Prompts, model and the cost sum are in
`app/src/lib/aiAssist.ts`, bundled into the function.

Only people who can edit an account can use AI help on it. In local mode
the buttons show a note that AI help needs the Supabase connection.

## Setup

1. Run `supabase/migrations/20261104090000_ai_assist.sql`.
2. Create an API key at console.anthropic.com (Settings, API keys). This is
   a normal API key, not the admin key used by usage import.
3. In Supabase, Edge Functions, Secrets, add `ANTHROPIC_API_KEY` with that key.
4. Deploy the function:

   ```
   npx supabase functions deploy ai-assist --no-verify-jwt
   ```

If the app runs on a domain other than `redreach-repo.github.io` or
`redreach.ae`, add it to the `ALLOWED_ORIGINS` secret (comma separated).
