# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send / inbox / sent | Façade → Zoho Mail (`lib/mailCalendar` + `zoho.ts`) |
| Calendar list / events / team meeting | Façade → Zoho Calendar |
| CRM follow-up sync | Façade → `CalendarProvider.syncFollowUp` / `deleteEvent` (Zoho adapter) |
| Settings provider label | Shows active provider from façade (Zoho; no switch yet) |

## Slice 1

- Façade: `lib/mailCalendar` — `getMailProvider` / `getCalendarProvider`
- Zoho adapters wrap existing `zoho.ts` APIs 1:1
- Rewired: EmailComposeModal, ZohoInboxPanel, ZohoCalendarPanel, ScheduleMeetingModal
- Docs + Google restricted Gmail scopes assessment **started** (no Gmail code)

## Slice 2 (this milestone step)

- Extended `CalendarProvider` with `syncFollowUp` / `deleteEvent` + `label`
- CRM follow-up sync on CrmPage + FollowupsPage goes through the façade
- Settings Zoho card shows **Active provider: Zoho** via `activeMailCalendarProviderLabel`
- Still Zoho-only under the hood (no Settings switch)

## Later slices (not yet)

1. Provider switch from Settings (still Zoho-only until then)
2. Gmail adapter (after compliance assessment)
3. M365 / IMAP

## Rules

- Do not break the Zoho proxy path or CRM follow-up sync
- No Google restricted-scope claims until `COMPLIANCE_NOTES.md` is filled with sources
