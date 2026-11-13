# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send | Zoho **or** Gmail **or** M365 (Phase A) |
| Inbox / Sent | Zoho; Gmail/M365 inbox = Phase B |
| Calendar / follow-up / meetings | Zoho **or** Google Calendar **or** Microsoft Graph calendar |
| Settings provider switch | Zoho + Gmail + M365 selectable; IMAP listed but unavailable |
| OAuth | `gmail-calendar`, `m365-mail-calendar` Edge Functions + connection tables |

## Slice 8 (this milestone step)

- Conclude **IMAP / other** compliance assessment in `COMPLIANCE_NOTES.md`
- Keep IMAP unavailable in Settings; reason points at compliance note
- **No IMAP OAuth or password client code**

## Later

1. Gmail / M365 Phase B inbox (`gmail.readonly` / `Mail.Read`) when gates allow
2. Generic IMAP only if a real non-API mailbox need appears

## Rules

- Do not break Zoho, Gmail Phase A, or M365 Phase A
- Prefer Gmail API / Graph over IMAP for those hosts
- No inbox restricted scopes until Phase B prerequisites in `COMPLIANCE_NOTES.md`
