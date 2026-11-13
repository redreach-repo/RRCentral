# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send | Zoho **or** Gmail **or** M365 (Phase A) |
| Inbox / Sent | Zoho; Gmail/M365 inbox = Phase B |
| Calendar / follow-up / meetings | Zoho **or** Google Calendar **or** Microsoft Graph calendar |
| Settings provider switch | Zoho + Gmail + M365 selectable |
| OAuth | `gmail-calendar`, `m365-mail-calendar` Edge Functions + connection tables |

## Slice 7 (this milestone step)

- `m365_connection` migration + `m365-mail-calendar` Edge Function
- Client `lib/m365MailCalendarApi.ts` + M365 mail/calendar adapters
- Settings **Microsoft 365** connect card; M365 selectable in provider switch
- Phase A scopes only: `Mail.Send` + `Calendars.ReadWrite`

## Later

1. Gmail / M365 Phase B inbox (`gmail.readonly` / `Mail.Read`)
2. IMAP

## Ops (M365)

1. Entra app: secrets `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (optional `MICROSOFT_TENANT_ID`)
2. Redirect URI `…/functions/v1/m365-mail-calendar`
3. `npx supabase functions deploy m365-mail-calendar`
4. Apply migration `20261113170000_m365_connection.sql`

## Rules

- Do not break Zoho or Gmail Phase A
- No inbox restricted scopes until Phase B prerequisites in `COMPLIANCE_NOTES.md`
