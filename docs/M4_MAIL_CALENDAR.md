# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send / inbox / sent | Zoho Mail via `zoho-proxy` + `lib/zoho.ts` |
| Calendar list / events / team meeting | Zoho Calendar via same stack |
| CRM follow-up sync | Still Zoho-specific (`syncFollowUpToZohoCalendar`) |

## Slice 1 (this milestone step)

- Façade: `lib/mailCalendar` — `getMailProvider` / `getCalendarProvider`
- Zoho adapters wrap existing `zoho.ts` APIs 1:1
- Rewired: EmailComposeModal, ZohoInboxPanel, ZohoCalendarPanel, ScheduleMeetingModal
- Docs + Google restricted Gmail scopes assessment **started** (no Gmail code)

## Later slices (not yet)

1. Provider switch from Settings (still Zoho-only until then)
2. Gmail adapter (after compliance assessment)
3. Follow-up calendar sync through the façade
4. M365 / IMAP

## Rules

- Do not break the Zoho proxy path or CRM follow-up sync in slice 1
- No Google restricted-scope claims until `COMPLIANCE_NOTES.md` is filled with sources
