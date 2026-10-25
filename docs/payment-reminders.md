# One tap payment reminders

On **Invoices → Payment reminders due**, each invoice that is 3, 7 or 14 days
past its due date has two buttons:

- **Email** sends the prepared reminder to the account's contact (the primary
  contact first) through the Zoho Mail connection in Settings.
- **WhatsApp** sends it to the contact's WhatsApp number through the Meta
  WhatsApp API, using an approved message template.

One tap sends it. **Edit** opens the email first if you want to change the
wording, and **Mark sent** records a reminder sent some other way.

Rules:

- **Never automatic.** Only an admin, manager or sales person pressing a button sends anything.
- **Never twice for the same stage.** The `payment-reminder` function records
  the reminder in `invoice_reminders` (unique invoice and stage) before
  sending, so a second press, or two people at once, sends nothing. If sending
  fails, the record is removed so you can press again once it is fixed.
- **Logged.** Each send writes a line on the account timeline, and the
  `invoice_reminders` row is in the audit log under the person who sent it.

Until a channel is set up, its button falls back to the old way: Email opens
the message to send yourself, WhatsApp opens WhatsApp with the message ready.

## Set it up

**1. Deploy.** GitHub → RRCentral → **Actions** → **Deploy Edge Functions** →
**Run workflow** → pick `payment-reminder` → **Run workflow**. Do the same for
`daily-digest` (it now shares the Zoho Mail code). System check: "One tap
payment reminders" should say OK.

**2. Email.** Nothing more if Zoho Mail is already connected in **Settings → Zoho**
(Mail set to yes).

**3. WhatsApp (optional).** A reminder starts the conversation, so Meta only allows it as a template.

1. Meta Business Suite → WhatsApp Manager → Message templates → **Create**:
   name `rr_payment_reminder`, category **Utility**, language English (`en`), body:

   ```
   Dear {{1}}, a reminder that invoice {{2}} for {{3}} was due on {{4}} and is now {{5}} days overdue. If you have already paid, thank you, and please ignore this message. Best regards, {{6}} accounts team.
   ```

   Example values for the review: `Dana`, `RR-03-26010`, `AED 1,050.00`, `27 October 2026`, `7`, `Red Reach`.
2. Wait for Meta to approve it.
3. The secrets `WHATSAPP_PHONE_NUMBER_ID` and `META_ACCESS_TOKEN` are the same as for
   the daily digest and WhatsApp tickets. Optional: `PAYMENT_REMINDER_WHATSAPP_TEMPLATE`
   (default `rr_payment_reminder`) and `PAYMENT_REMINDER_WHATSAPP_LANGUAGE` (default `en`).

No SQL is needed: `invoice_reminders` already exists.
