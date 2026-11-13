# M4 — Mail and calendar providers

**Goal:** Multi-provider mail/calendar (Zoho → Gmail → M365 → IMAP) without rewriting call sites each time.

## Today

| Capability | Implementation |
|------------|----------------|
| Send | Zoho **or** Gmail **or** M365 |
| Inbox / Sent | Zoho **or** M365 (Phase B); Gmail inbox still blocked on CASA |
| Calendar / follow-up / meetings | Zoho **or** Google Calendar **or** Microsoft Graph calendar |
| Settings provider switch | Zoho + Gmail + M365 selectable; IMAP listed but unavailable |
| OAuth | `gmail-calendar`, `m365-mail-calendar` Edge Functions + connection tables |

## Slice 9 (this milestone step)

- M365 Phase B: add delegated `Mail.Read`; `listInbox` / `listSent` via Graph
- Reconnect required for accounts that connected on Phase A scopes only
- Gmail Phase B still deferred (restricted `gmail.readonly` + CASA)

## Later

1. Gmail Phase B inbox when restricted verification + CASA plan allow
2. Generic IMAP only if a real non-API mailbox need appears

## Ops (M365 Phase B)

1. Redeploy `m365-mail-calendar` after merge
2. Disconnect + Connect Microsoft 365 in Settings to grant `Mail.Read`
3. Select Microsoft 365 as the mail/calendar provider

## Rules

- Do not break Zoho or Gmail Phase A
- Prefer Gmail API / Graph over IMAP
- No Gmail `gmail.readonly` until Phase B prerequisites in `COMPLIANCE_NOTES.md`
