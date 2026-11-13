# Compliance notes

Findings from official sources go here **before** shipping tax, payroll, e-sign, e-invoice, or Google restricted-scope features (Master Spec §0 rule 8).

| Topic | Status | Source checked | Date | Notes |
|-------|--------|----------------|------|-------|
| UAE electronic signatures / trust services | not started | — | — | Required before M5 claims |
| UAE WPS SIF format | not started | — | — | Required before M8 bank file |
| UAE end-of-service gratuity | not started | — | — | Required before M8 formula |
| UAE VAT rates / return layout | not started | — | — | Partial product VAT today; verify before M7 return |
| UAE corporate tax | not started | — | — | M7+ |
| UAE e-invoicing timeline / format | not started | — | — | Design invoice model for accredited provider |
| Google restricted Gmail scopes assessment | **concluded** | See § Gmail below | 13 Nov 2026 | Phase A **implemented** (`gmail.send` + `calendar.events` via `gmail-calendar` Edge Function). Phase B inbox (`gmail.readonly`) still blocked until restricted verification + CASA plan. |
| Data residency (UAE hosting options) | not started | — | — | Decide before first external customer / M13 |

Do not rely on model memory for legal or tax rules.

---

## Gmail / Google Calendar (M4) — assessment

**Purpose:** Decide which Google scopes RR Central may request for a future Gmail mail/calendar adapter, and what verification is required before shipping.

### Official sources (checked 13 Nov 2026, Asia/Dubai)

1. [Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) — classifies `gmail.send` as **sensitive**; `gmail.readonly`, `gmail.compose`, `gmail.modify`, `gmail.metadata`, full `mail.google.com`, etc. as **restricted**. Restricted scopes that store/transmit data on servers require a **security assessment**.
2. [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) — restricted scopes need OAuth verification; server-side access to restricted data needs annual third-party security assessment (CASA / App Defense Alliance). Exceptions include personal use, Testing publishing status, internal Workspace apps, etc.
3. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) — sensitive scopes need verification for production consumer access (Calendar event access cited as a sensitive example).
4. [Google Workspace user data and developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) — approved Gmail use cases include CRM / productivity enhancers; disallows several non-CRM patterns (e.g. one-time email export tools, spam).
5. [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth) — Calendar scope list; core event scopes are treated as **sensitive** (not on Google’s restricted Gmail/Drive-style list).

### Scope matrix for RR Central (parity with today’s Zoho features)

| Feature today (Zoho) | Candidate Google scope | Classification | Verification bar |
|----------------------|------------------------|----------------|------------------|
| Send mail from CRM | `https://www.googleapis.com/auth/gmail.send` | Sensitive | Brand + sensitive OAuth verification (no CASA for this scope alone) |
| Inbox / Sent dashboard match | `https://www.googleapis.com/auth/gmail.readonly` | **Restricted** | Restricted verification; **CASA** if messages are stored or transmitted via our servers (likely with Supabase / edge proxy) |
| Compose drafts + send | `gmail.compose` | Restricted | Avoid — prefer `gmail.send` for send-only |
| Follow-up / team meetings | `https://www.googleapis.com/auth/calendar.events` (or `.owned`) | Sensitive | Sensitive verification |
| Calendar list / read board | `calendar.events.readonly` / `calendar.readonly` | Sensitive | Sensitive verification |

### Use-case fit

Workspace policy lists CRM / productivity enhancers as an **approved** Gmail scope use case. RR Central’s compose + follow-up calendar sync fits; bulk spam / one-shot mailbox export do **not**.

### Decision (binding for M4)

1. **Phase A (shipped in M4 slice 5):** Gmail **send** + Google Calendar via `gmail-calendar` Edge Function and `gmail_connection`. Scopes: `gmail.send` + `calendar.events` only. Production still needs Google sensitive-scope verification (or Testing / Internal while prototyping). **Do not** request `gmail.readonly` in Phase A.
2. **Phase B (later):** Inbox / Sent matching via `gmail.readonly` only after restricted-scope verification **and** a plan for CASA if any restricted Gmail data is stored or proxied through our backend. Until then keep inbox on Zoho (or omit).
3. **Least privilege:** Never request `https://mail.google.com/` or `gmail.modify` unless a documented need appears; prefer `gmail.send` over `gmail.compose` for send-only.
4. **Settings switcher:** Gmail is selectable; Connect card must succeed before APIs work.

### Explicit non-claims

- This note does **not** assert that RR Central is already verified, CASA-assessed, or cleared for public consumer Gmail access beyond Testing/Internal exceptions.
