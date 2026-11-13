# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send / inbox / sent | Façade → Zoho Mail (`lib/mailCalendar` + `zoho.ts`) |
| Calendar list / events / team meeting | Façade → Zoho Calendar |
| CRM follow-up sync | Façade → `CalendarProvider.syncFollowUp` / `deleteEvent` (Zoho adapter) |
| Settings provider switch | `mailCalendarProvider` setting + select (Zoho selectable; others listed disabled) |
| Gmail compliance | **Concluded** in `COMPLIANCE_NOTES.md` — Phase A send+calendar (sensitive); Phase B inbox (restricted) |

## Slice 1

- Façade: `lib/mailCalendar` — `getMailProvider` / `getCalendarProvider`
- Zoho adapters wrap existing `zoho.ts` APIs 1:1
- Rewired: EmailComposeModal, ZohoInboxPanel, ZohoCalendarPanel, ScheduleMeetingModal
- Docs + Google restricted Gmail scopes assessment **started** (no Gmail code)

## Slice 2

- Extended `CalendarProvider` with `syncFollowUp` / `deleteEvent` + `label`
- CRM follow-up sync on CrmPage + FollowupsPage goes through the façade
- Settings showed active provider label

## Slice 3

- Setting key `mailCalendarProvider` (default `zoho`)
- `resolveMailCalendarProviderId` / `listMailCalendarProviderOptions`
- Settings **Mail & calendar** card: provider `<select>` (Gmail / M365 / IMAP disabled with reasons)
- Getters read the setting; only Zoho adapter exists — unavailable ids fall back to Zoho

## Slice 4 (this milestone step)

- Concluded Google Gmail/Calendar scopes assessment with official sources in `COMPLIANCE_NOTES.md`
- Binding plan: **Phase A** = `gmail.send` + Calendar (sensitive only); **Phase B** = `gmail.readonly` after restricted verification + CASA plan
- Settings Gmail disabled reason updated (no longer “compliance unfinished”)
- Still **no** Gmail OAuth / adapter code

## Later slices (not yet)

1. Gmail Phase A adapter (OAuth + send + calendar) — after Cloud project / consent screen work
2. Gmail Phase B inbox (restricted scopes)
3. M365 / IMAP

## Rules

- Do not break the Zoho proxy path or CRM follow-up sync
- No Gmail restricted-scope calls until Phase B prerequisites in `COMPLIANCE_NOTES.md` are met
