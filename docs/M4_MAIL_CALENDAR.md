# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send / inbox / sent | Façade → Zoho Mail (`lib/mailCalendar` + `zoho.ts`) |
| Calendar list / events / team meeting | Façade → Zoho Calendar |
| CRM follow-up sync | Façade → `CalendarProvider.syncFollowUp` / `deleteEvent` (Zoho adapter) |
| Settings provider switch | `mailCalendarProvider` setting + select (Zoho selectable; others listed disabled) |

## Slice 1

- Façade: `lib/mailCalendar` — `getMailProvider` / `getCalendarProvider`
- Zoho adapters wrap existing `zoho.ts` APIs 1:1
- Rewired: EmailComposeModal, ZohoInboxPanel, ZohoCalendarPanel, ScheduleMeetingModal
- Docs + Google restricted Gmail scopes assessment **started** (no Gmail code)

## Slice 2

- Extended `CalendarProvider` with `syncFollowUp` / `deleteEvent` + `label`
- CRM follow-up sync on CrmPage + FollowupsPage goes through the façade
- Settings showed active provider label

## Slice 3 (this milestone step)

- Setting key `mailCalendarProvider` (default `zoho`)
- `resolveMailCalendarProviderId` / `listMailCalendarProviderOptions`
- Settings **Mail & calendar** card: provider `<select>` (Gmail / M365 / IMAP disabled with reasons)
- Getters read the setting; only Zoho adapter exists — unavailable ids fall back to Zoho

## Later slices (not yet)

1. Gmail adapter (after compliance assessment)
2. M365 / IMAP

## Rules

- Do not break the Zoho proxy path or CRM follow-up sync
- No Google restricted-scope claims until `COMPLIANCE_NOTES.md` is filled with sources
