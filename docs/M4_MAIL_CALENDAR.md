# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send / inbox / sent | Façade → Zoho **or** Gmail send (Phase A); Gmail inbox = Phase B |
| Calendar list / events / team meeting / follow-up | Façade → Zoho **or** Google Calendar (`calendar.events`) |
| Settings provider switch | `mailCalendarProvider` — Zoho + Gmail selectable; M365 listed disabled |
| Gmail OAuth | `gmail-calendar` Edge Function + `gmail_connection` (service-role only) |
| M365 compliance | **Concluded** in `COMPLIANCE_NOTES.md` — Phase A `Mail.Send` + `Calendars.ReadWrite` |

## Slice 1–5

- Façade, Zoho adapters, follow-up, provider switch, Gmail compliance, Gmail Phase A OAuth

## Slice 6 (this milestone step)

- Concluded Microsoft Graph mail/calendar assessment with official Learn sources
- Binding plan: **Phase A** = delegated `Mail.Send` + `Calendars.ReadWrite`; **Phase B** = `Mail.Read`
- Settings / provider catalog reason updated; **no** M365 OAuth or adapter code

## Later

1. M365 Phase A adapter (Entra app + Edge Function, mirror Gmail)
2. Gmail Phase B inbox (`gmail.readonly` + verification/CASA)
3. M365 Phase B inbox; IMAP

## Ops (Gmail — already on main)

1. Prefer `GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET` (falls back to Drive’s `GOOGLE_CLIENT_*`)
2. Add redirect URI `…/functions/v1/gmail-calendar` in Google Cloud Console
3. `npx supabase functions deploy gmail-calendar`
4. Apply migration `20261113160000_gmail_connection.sql`

## Rules

- Do not break the Zoho proxy path or Gmail Phase A
- No `gmail.readonly` until Phase B prerequisites in `COMPLIANCE_NOTES.md`
- No Microsoft Graph calls until M365 Phase A implementation slice
