# Prospect outreach (Phase 1)

Sales > Marketing > **Prospect outreach** (admin and manager only; hide it per
person in Settings, Users). Migration `20261338090000_outreach_pipeline.sql`.
Email setup checklist (DKIM, DMARC, warm-up): `docs/outreach-setup.md`.

## How it works

1. **Import prospects**: upload an .xlsx or .csv with the columns Company,
   Contact name, Title, Email, Country, Signal used, Signal source URL,
   Subject, Body, Send from, Status, Checks before sending (a template is on the
   page). Press **Check for duplicates**: rows are staged and marked New,
   Needs enrichment (no email, or only info@ and the like), Duplicate (same
   company, email or email domain earlier in the sheet or already in the CRM),
   Blocked (CompMan / CTRM Next list or do-not-email list) or Problem.
   **Create** makes, for each New and Needs enrichment row, a CTRM prospect
   account (AC-09-...), a contact (with data source and country), a CTRM Next
   deal (stage Identified) and a **draft** email.
2. **Review and send**: open each email, edit To, Subject and Body, open the
   signal link, then **Approve**, **Reject** or **Pass**. Approved emails with
   every check passing are **Ready to send**; press **Send from
   you@redreach.ae**. One email goes per press, from your own Zoho mailbox.
3. **Settings**: daily cap (default 10), company legal name and postal address,
   opt-out line, your signature, the CompMan / CTRM Next lists and the
   do-not-email list.

## Hard rules (enforced in the database)

- Only a signed in admin or manager in a real sign in session can import,
  edit, approve or send. AI connector (MCP) tokens, API keys and admin "View
  as user" sessions are refused, and the tables cannot be written directly.
- Sending needs `approved_by` = the person pressing Send and a stored SHA-256
  hash of the exact recipient, subject and body that matches. Any change, from
  anywhere, moves the email back to **Awaiting approval**.
- Under the daily cap (company-wide, Dubai day), one send at a time, never to a
  suppressed address or domain.
- Every email ends with the sender's signature, the company's legal name and
  postal address, and an opt-out line with an unsubscribe link.
- The audit log and function logs never hold the email subject or body.

## What a send records

- `outreach_events` (sent, with the Zoho message id)
- The account timeline ("Outreach email sent to ...")
- The client's email history (`mail_links`, header only)
- The CTRM deal: last touch now; Identified moves to Contacted with the next
  action "Follow up on the outreach email" in 5 days.

## Unsubscribe

The link goes to the public `outreach-unsubscribe` function. Opening it shows a
button (so link scanners do not unsubscribe anyone); pressing it adds the
address to `outreach_suppressions` and marks the email Unsubscribed. Zoho
Mail's send API has no custom header field, so there is no `List-Unsubscribe`
header; the link in the footer is the opt-out.

## Setup

1. SQL copy page: `supabase-sql/outreach-pipeline.sql`.
2. Actions, Deploy Edge Functions: `mail-inbox`, then `outreach-unsubscribe`.
3. Settings tab: legal name, postal address, signature, lists.

No new secrets. Sending uses the person's existing Mail connection.

## Later phases (not built)

AI drafting, reply sync (replied / bounced from the inbox), sequences,
dashboard, Apollo enrichment, templates screen (the `outreach_templates` table
exists).
