# Mail (each person's own Zoho mailbox inside RR Central)

Sidebar → **Mail**. Each person connects their **own** Zoho mailbox once, then sees Inbox, Sent
and their other Zoho folders, search across their mail, an "Unread only" filter and the full
email. Emails to or from a contact in the CRM show the company as a tag that opens the CRM record.

**Per person only (Alfred, 20 Nov 2026).** Nobody can open another person's mailbox, admins
included. There is no shared company mailbox on this page.

**Nothing is sent from this page yet.** Nothing is sent, moved, deleted or marked as read in
your mailbox. Reply and compose, and attachments, follow in later steps (plan: https://claude.ai/artifact/RjkwrePUggkPB1qq5LcuC4). Sending will ask
everyone to reconnect once, to add the send permission.

## Linking an email to a record

Open an email and press **Link to…**. Pick a client, a CRM company or deal, a quotation or an
invoice (the client and CRM company matched from the email address are offered first). The
email then shows under **Emails** on the client's page (emails linked to the client or to its
CRM company), and as a chip on the email. Click the × on a chip to unlink.

- Only the email's header goes on the record: subject, sender, recipients, date, and whether it
  has attachments. The body stays in your mailbox, so only you can open it; colleagues see
  "in <your address>'s mailbox".
- Links are written by the `mail-inbox` function, which reads the header from your own mailbox,
  so nobody can invent a link for an email they do not have.
- Admin, manager and sales see the email history (like clients and quotations). Whoever linked
  an email can unlink it; managers and admins can unlink any.
- SQL: `supabase/migrations/20261322100000_mail_links.sql` (safe to run twice). Until it is run
  the Emails card stays hidden and **Link to…** says it is not set up.

## Who can open it

Admin, manager and sales. Staff (assigned accounts only) and viewers do not see the menu item,
and the `mail-inbox` function refuses them as well (it checks `rr_is_staff`).
Hide the whole module with `app_settings.moduleFlags` `{"mail":false}`.

## How it is safe

- **Your mailbox only.** When someone connects, the function checks that the Zoho mailbox's
  address is their RR Central login. Otherwise the key is thrown away and nothing is saved.
- **Keys encrypted.** Each person's Zoho refresh token is encrypted (AES-256-GCM) with the
  `MAIL_TOKEN_KEY` secret before it is saved in `mail_accounts`. That table has row level
  security on and no policies, so no signed in user can read it; only the function can, with
  the service role. The Zoho access token never reaches the browser.
- **Disconnect** removes the row and revokes the key at Zoho.
- Email content is cleaned on the server (scripts, frames, forms and inline handlers removed)
  and shown in a sandboxed frame with scripts off and a strict content policy. Pictures from the
  internet load only after **Show images**, so senders cannot track when an email was opened.

## Setup (once, by an admin)

1. **Zoho app.** At https://api-console.zoho.com click **Add Client → Server-based Applications**.
   - Client Name: `RR Central Mail`
   - Homepage URL: `https://redreach-repo.github.io/RRCentral/`
   - Authorized Redirect URI: `https://<project-ref>.supabase.co/functions/v1/mail-inbox`
   Copy the **Client ID** and **Client Secret**. (Use the console for your Zoho region, e.g.
   api-console.zoho.eu, if the company's Zoho account is not on zoho.com.)
2. **Supabase secrets** (Edge Functions → Secrets):
   - `ZOHO_MAIL_CLIENT_ID` = the Client ID
   - `ZOHO_MAIL_CLIENT_SECRET` = the Client Secret
   - `MAIL_TOKEN_KEY` = a long random value, at least 32 characters. Keep it; if it changes,
     everyone has to connect their mailbox again.
   - Only if the company's Zoho is not on zoho.com: `ZOHO_ACCOUNTS_DOMAIN` = e.g. `https://accounts.zoho.eu`
3. **SQL**: run `supabase/migrations/20261322090000_mail_accounts.sql` (safe to run twice).
4. **Deploy**: GitHub → Actions → **Deploy Edge Functions** → Function `mail-inbox` → Run workflow.
5. Each person opens **Mail** and presses **Connect my mailbox**.

System check lists `mail-inbox`: red until deployed and until the three secrets are set.
