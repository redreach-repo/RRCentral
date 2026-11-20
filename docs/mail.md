# Mail (company Zoho mailbox inside RR Central)

Sidebar → **Mail**. Inbox, Sent and every other Zoho folder, search across all mail, an
"Unread only" filter, and the full email. Emails to or from a contact in the CRM show the
company as a tag that opens the CRM record.

**Step 1 is read only.** Nothing is sent, moved, deleted or marked as read from this page.
Reply, compose, linking emails to quotations, invoices and deals, per-person mailboxes and
attachments follow in later steps (plan: https://claude.ai/artifact/RjkwrePUggkPB1qq5LcuC4).

## Who can open it

Admin, manager and sales. Staff (assigned accounts only) and viewers do not see the menu item,
and the `mail-inbox` function refuses them as well (it checks `rr_is_staff`).
Hide the whole module with `app_settings.moduleFlags` `{"mail":false}`.

## How it is safe

- The page talks only to the `mail-inbox` Edge Function. The Zoho Client Secret and Refresh
  Token stay in `app_settings` (admin only by RLS), are read by the function with the service
  role, and the Zoho access token never leaves the function.
- Email content is cleaned on the server (scripts, frames, forms and inline handlers removed)
  and shown in a sandboxed frame with scripts off and a strict content policy. Pictures from the
  internet load only after **Show images**, so senders cannot track when an email was opened.

## Setup (once)

Nothing new if Zoho Mail already works (digest, payment reminders and client reports send through it).

1. GitHub → Actions → **Deploy Edge Functions** → Function `mail-inbox` → Run workflow.
2. Open **Mail**. If it says Zoho Mail is not connected, an admin sets Settings → Zoho → Mail to
   **yes**. If Zoho refuses the key, reconnect Zoho with the Mail read scopes
   (`ZohoMail.messages.READ`, `ZohoMail.folders.READ`, `ZohoMail.accounts.READ`).

System check lists `mail-inbox` (red until deployed). No SQL in this step.
