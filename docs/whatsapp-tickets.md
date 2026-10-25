# WhatsApp to tickets

Clients message your WhatsApp Business number and the message lands in
Support as a ticket. You reply from the ticket and it goes back to them on
WhatsApp.

## How it works

- **A new message** from a number with no open ticket opens a new ticket
  (channel WhatsApp). The number is matched to a contact's WhatsApp or phone
  field, so the ticket is filed on that client with their SLA clock. Unknown
  numbers open an unfiled ticket for the team to file.
- **Further messages** from the same number join its open ticket. A ticket
  waiting on the client goes back to open.
- Photos, voice notes and documents show as a note saying what was sent;
  open WhatsApp to see the file.
- **Replying:** on a WhatsApp ticket, write the reply and press
  **Send on WhatsApp**. It is sent and logged on the ticket, counts as the
  first reply for the SLA, and shows Sent, Delivered, Read or Not delivered.
- **The 24 hour rule:** WhatsApp only allows a normal reply within 24 hours
  of the client's last message. After that the button is greyed out and the
  page says so. Call them, or wait for them to write again.

Rules and tests: `app/src/lib/whatsappTickets.ts` (bundled into both functions).

## What to provide

From Meta (developers.facebook.com, your app, WhatsApp):

| Secret | Where to find it |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp, API Setup, Phone number ID (same as the daily digest) |
| `META_ACCESS_TOKEN` | A permanent System User token with whatsapp_business_messaging (same as the daily digest) |
| `WHATSAPP_APP_SECRET` | App settings, Basic, App secret |
| `WHATSAPP_VERIFY_TOKEN` | Any long random text you make up; you type the same text into Meta in step 4 |

Add them yourself in Supabase, Edge Functions, Secrets.

## Setup

1. Run `supabase/migrations/20261105120000_whatsapp_tickets.sql`.
2. Add the secrets above.
3. Deploy both functions:

   GitHub → RRCentral → **Actions** → **Deploy Edge Functions** → **Run workflow**, once with `whatsapp-in` and once with `whatsapp-send`.
   Verify JWT is off for them in `supabase/config.toml`; each checks the caller itself.

4. In Meta, WhatsApp, Configuration, Webhook: Callback URL
   `https://<your-project>.supabase.co/functions/v1/whatsapp-in`, Verify token
   the `WHATSAPP_VERIFY_TOKEN` text. Press Verify and save, then subscribe to
   the **messages** field.
5. Send a WhatsApp to the business number from a phone saved on a client
   contact, and check a ticket appears in Support.

If the number is also used in the WhatsApp Business app on a phone, check
with Meta that the API and the app can share it (coexistence); otherwise use
a number that is only on the API.
