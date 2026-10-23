# Support email in

Turns email sent to your shared support address (for example `support@redreach.ae`)
into tickets on the RR Central support desk.

RR Central did not have an inbound email route, so this is the endpoint. Which
email service forwards mail to it is your choice. Anything that can POST JSON
to a URL works: Postmark inbound, Mailgun routes, SendGrid Inbound Parse (via a
small relay), or a Cloudflare Email Worker.

## What it does

* Matches the sender's email to a contact on an account. A match opens the
  ticket on that account, with the SLA from its package or account type.
* An unknown sender still gets a ticket, with no account. Admins, managers and
  sales see it under "Unknown sender" and file it on the right account.
* A reply to an earlier email (same thread) is added to the existing ticket and
  reopens it if it was resolved.
* The same email delivered twice is ignored.

## Set up

1. Deploy the function, with both files in this folder (`index.ts` and
   `sla.bundle.js`):

   ```bash
   npx supabase functions deploy support-email-in --no-verify-jwt
   ```

   In the Supabase dashboard, name the function `support-email-in`, add both
   files with these exact names, and switch Verify JWT off.

2. Pick a long random secret and store it:

   ```bash
   npx supabase secrets set SUPPORT_INBOUND_SECRET=your-long-random-string
   ```

   Without it the function refuses every request.

3. Point your email service at

   `https://<project-ref>.supabase.co/functions/v1/support-email-in`

   and send the secret as the `x-support-secret` header. If the service cannot
   set headers, use HTTP Basic auth with any user name and the secret as the
   password, for example `https://inbound:SECRET@<project-ref>.supabase.co/...`
   (Postmark supports this).

## Payload

Postmark's inbound JSON works as is. Anything else should send:

```json
{
  "from": "Jane Doe <jane@clinic.example>",
  "fromName": "Jane Doe",
  "subject": "Bot not replying",
  "text": "Plain text body",
  "messageId": "<abc123@mail.example>",
  "inReplyTo": "<earlier-id@mail.example>",
  "references": "<first-id@mail.example> <earlier-id@mail.example>"
}
```

Only `from` is required. Bodies are cut at 20,000 characters.

## Replies

Replies written in RR Central are logged on the ticket and the account
timeline, but RR Central does not send email yet. Send the reply from your
inbox or WhatsApp as usual.

## Working time

The due time uses `app/src/lib/sla.ts`, bundled into `sla.bundle.js` so the app
and this function always agree. After changing `sla.ts`, run
`npm run build:support-fn` in `app/` and commit the new bundle. CI fails if you
forget.
