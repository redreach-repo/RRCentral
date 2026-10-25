# Lead intake

One door for new leads: the website contact form, WhatsApp click to chat
links and the AI CRM landing page all go through the `lead-intake` Edge
Function. The rules are in `app/src/lib/leadIntake.ts` (bundled into the
function).

## What happens to a lead

1. The function checks the caller: a server sends the shared
   `LEAD_INTAKE_SECRET` in the `x-lead-secret` header; a browser form first
   asks for a form token (`GET ?form_token=1`) and sends it back with the
   lead. Tokens are good from 3 seconds to 2 hours after they were issued.
   A hidden `website` field that people never fill in catches form bots.
2. Rate limit: 30 leads a minute overall and 5 per sender in ten minutes
   (the sender's address is kept only as a one way hash).
3. Matching: phone first, then email.
   - AI CRM landing page leads (`pipeline: ai_crm`) match AI CRM account
     contacts. No match: a new AI CRM account (status prospect) and contact.
     The account gets an AI CRM deal at Lead unless it already has an open one.
   - Everything else matches CRM rows (row phones and email, and the
     contacts inside the row). No match: a new CRM Lead. A match gets the
     message added to its notes.
4. Owner: always the same person, or taking turns (round robin), set under
   **Packages and rates → New leads: who gets them**.
5. Every lead is kept in `website_inquiries` with its channel, source and UTM
   values, and shows under **New leads** on the dashboard (7 days) and in the
   daily digest (last day).

## Sending a lead from the landing page (server side)

```
POST https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/lead-intake
x-lead-secret: <LEAD_INTAKE_SECRET>
Content-Type: application/json

{ "name": "Sara", "company": "Clinic LLC", "email": "sara@clinic.ae", "phone": "0501234567",
  "message": "Interested in the AI CRM", "channel": "landing_page", "pipeline": "ai_crm",
  "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "ai-crm-q4",
  "page_url": "https://..." }
```

## WhatsApp click to chat links

Use this link instead of `wa.me` on ads and pages:

```
https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/lead-intake?wa=1&text=Hi%20Red%20Reach&utm_source=instagram&utm_campaign=q4
```

It counts the click with its UTM values and opens WhatsApp on the number set
under **New leads: who gets them** (default 971507008977). A click is not a
lead, because the person has not said who they are yet.

## Setup

1. SQL: run "Wave 3: Lead intake" from the SQL copy page.
2. Secret: Supabase → Edge Functions → Secrets → add `LEAD_INTAKE_SECRET`
   (any long random text; the landing page needs the same value).
3. Deploy: GitHub → Actions → Deploy Edge Functions → Run workflow →
   `lead-intake`.
4. Settings: Packages and rates → New leads: who gets them.
