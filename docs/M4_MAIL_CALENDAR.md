# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send / inbox / sent | Façade → Zoho **or** Gmail send (Phase A); Gmail inbox = Phase B |
| Calendar list / events / team meeting / follow-up | Façade → Zoho **or** Google Calendar (`calendar.events`) |
| Settings provider switch | `mailCalendarProvider` — Zoho + Gmail selectable |
| Gmail OAuth | `gmail-calendar` Edge Function + `gmail_connection` (service-role only) |

## Slice 1–3

- Façade, Zoho adapters, follow-up via façade, Settings provider switch

## Slice 4

- Concluded Gmail scopes assessment (`COMPLIANCE_NOTES.md`) — Phase A vs B

## Slice 5 (this milestone step)

- `gmail_connection` migration + `gmail-calendar` Edge Function (Connect OAuth)
- Client `lib/gmailCalendarApi.ts` + `gmailMailAdapter` / `gmailCalendarAdapter`
- Settings **Gmail & Google Calendar** connect card; Gmail selectable in provider switch
- Phase A scopes only: `gmail.send` + `calendar.events` (primary calendar)
- Inbox/Sent on Gmail throw Phase B errors

## Later

1. Gmail Phase B inbox (`gmail.readonly` + verification/CASA)
2. M365 / IMAP

## Ops

1. Prefer `GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET` (falls back to Drive’s `GOOGLE_CLIENT_*`)
2. Add redirect URI `…/functions/v1/gmail-calendar` in Google Cloud Console
3. `npx supabase functions deploy gmail-calendar`
4. Apply migration `20261113160000_gmail_connection.sql`
5. Settings → Connect Gmail → select Provider **Gmail**

## Rules

- Do not break the Zoho proxy path
- No `gmail.readonly` until Phase B prerequisites in `COMPLIANCE_NOTES.md`
